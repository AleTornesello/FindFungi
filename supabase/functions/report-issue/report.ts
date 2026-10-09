// What the report-issue edge function reads from a request, kept apart from the handler so it
// can be tested without a database: `deno test supabase/functions/report-issue/`.

/**
 * Parts of a species page a report can be about. The same list as the check on
 * species_reports.field and REPORT_FIELDS in frontend/src/data/reports.ts.
 */
export const REPORT_FIELDS = [
  "commonNameIt",
  "commonNameEn",
  "edibility",
  "toxicity",
  "cap",
  "hymenium",
  "lamella",
  "stipe",
  "gleba",
  "sporePrint",
  "ecology",
  "conservationStatus",
  "taxonomy",
  "photos",
  "other",
] as const;

export type ReportField = (typeof REPORT_FIELDS)[number];

export interface Report {
  mushroomId: number | null;
  scientificName: string;
  kind: "missing" | "wrong";
  /** Null for the species as a whole. */
  field: ReportField | null;
  message: string;
  source: string | null;
  locale: "it" | "en";
}

const isReportField = (v: unknown): v is ReportField => REPORT_FIELDS.includes(v as ReportField);

/**
 * The report in `body`, "spam" if the hidden `website` field was filled in, or undefined if it
 * is malformed. Text is trimmed; lengths are left to the table's checks.
 */
export function parseReport(body: unknown): Report | "spam" | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const { mushroomId, scientificName, kind, field, message, source, locale, website } = body as Record<
    string,
    unknown
  >;
  // People never see the field; only bots fill it in.
  if (typeof website === "string" && website.trim() !== "") return "spam";

  if (mushroomId !== undefined && mushroomId !== null && !Number.isInteger(mushroomId)) return undefined;
  if (typeof scientificName !== "string" || typeof message !== "string") return undefined;
  if (kind !== "missing" && kind !== "wrong") return undefined;
  if (locale !== "it" && locale !== "en") return undefined;
  if (field !== undefined && field !== null && !isReportField(field)) return undefined;
  if (source !== undefined && source !== null && typeof source !== "string") return undefined;

  return {
    mushroomId: (mushroomId as number | undefined) ?? null,
    scientificName: scientificName.trim(),
    kind,
    field: (field as ReportField | null | undefined) ?? null,
    message: message.trim(),
    source: (source as string | null | undefined)?.trim() || null,
    locale,
  };
}

/**
 * The sender's IP. Cloudflare, in front of Supabase, sets cf-connecting-ip from the connection
 * itself, while proxies append to an x-forwarded-for the client may have forged: its first
 * address is only a fallback.
 */
export function clientIp(headers: Headers): string | null {
  const ip = headers.get("cf-connecting-ip")?.trim() || headers.get("x-forwarded-for")?.split(",")[0].trim();
  return ip || null;
}

/** Hex SHA-256 of the salt and the IP: the same sender always gets the same hash, but it can't be reversed without the salt. */
export async function hashIp(salt: string, ip: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + ip));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The `ip_hash` of senders whose IP can't be read: they share one bucket, so leaving it out doesn't lift the limit. */
export const UNKNOWN_IP = "unknown";

/** The `ip_hash` the sender of a request is counted under. */
export async function senderIpHash(salt: string, headers: Headers): Promise<string> {
  const ip = clientIp(headers);
  return ip ? await hashIp(salt, ip) : UNKNOWN_IP;
}
