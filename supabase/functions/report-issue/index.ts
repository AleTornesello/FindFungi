// Stores a report of missing or wrong information on a species page in `species_reports`:
// anonymously when the request comes with the anon key, or with the user's id when it comes
// with a signed-in user's token. The table has no policies, so the browser writes through this
// function rather than the Data API.
//
// POST JSON: { mushroomId?, scientificName, kind: "missing" | "wrong", field?, message, source?,
// locale: "it" | "en", website? }. `website` is a field people never see: reports that fill it
// in are dropped with the same answer as stored ones, so bots don't notice. Each sender can send
// a limited number of reports per hour, counted by user id, or for anonymous senders by a
// salted hash of their IP: the IP itself is never stored.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import postgres from "npm:postgres@3.4.7";
import { parseReport, senderIpHash, type Report } from "./report.ts";

// The app calls the function from the browser, on another origin.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { max: 1, prepare: false });

const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, ANON_KEY);

// Unsalted, the hashes of every IPv4 address could be computed and the IPs read back.
const IP_SALT = Deno.env.get("REPORT_IP_SALT");
if (!IP_SALT) throw new Error("REPORT_IP_SALT must be set");

/** Reports a sender can send per hour. */
const ANONYMOUS_LIMIT = 10;
const USER_LIMIT = 30;

/**
 * The id of the signed-in user who sent the request, null if it was sent with the anon key, or
 * undefined if the token doesn't verify (expired, or forged).
 */
async function requestUser(req: Request): Promise<string | null | undefined> {
  const token = req.headers.get("Authorization")?.replace(/^Bearer /, "");
  if (!token || token === ANON_KEY) return null;
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data) return undefined;
  return data.claims.role === "authenticated" ? data.claims.sub : null;
}

const badRequest = (error: string) => Response.json({ error }, { status: 400, headers: CORS_HEADERS });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { ...CORS_HEADERS, Allow: "POST, OPTIONS" },
    });
  }

  let report: Report | "spam" | undefined;
  try {
    report = parseReport(await req.json());
  } catch {
    // Not JSON.
  }
  if (!report) return badRequest("Expected a report as JSON");
  if (report === "spam") return new Response(null, { status: 204, headers: CORS_HEADERS });

  const userId = await requestUser(req);
  if (userId === undefined) {
    return Response.json({ error: "Invalid session" }, { status: 401, headers: CORS_HEADERS });
  }

  const ipHash = await senderIpHash(IP_SALT, req.headers);
  // Signed-in users are counted by account, anyone else by IP.
  const sender = userId ? sql`user_id = ${userId}::uuid` : sql`ip_hash = ${ipHash}`;
  const limit = userId ? USER_LIMIT : ANONYMOUS_LIMIT;

  try {
    // A species removed from the dataset since the app cached it gets a null id: the name keeps
    // the report readable. Counting and inserting in one statement keeps the limit tight; a burst
    // of concurrent requests can still go a few reports over it.
    const inserted = await sql`
      INSERT INTO species_reports (mushroom_id, scientific_name, kind, field, message, source, locale,
                                   user_id, ip_hash)
      SELECT (SELECT id FROM mushrooms WHERE id = ${report.mushroomId}::integer),
             ${report.scientificName}, ${report.kind}::report_kind, ${report.field}, ${report.message},
             ${report.source}, ${report.locale}, ${userId}::uuid, ${ipHash}
      WHERE (SELECT count(*) FROM species_reports
             WHERE ${sender} AND created_at > now() - interval '1 hour') < ${limit}
      RETURNING id
    `;
    if (inserted.length === 0) {
      return Response.json({ error: "Too many reports" }, { status: 429, headers: CORS_HEADERS });
    }
  } catch (e) {
    // Check, foreign key and data format violations: the report itself is invalid.
    const code = (e as { code?: string }).code;
    if (code === "23514" || code === "23503" || code?.startsWith("22")) return badRequest("Invalid report");
    console.error("Insert failed:", e);
    return Response.json({ error: "Could not send the report" }, { status: 500, headers: CORS_HEADERS });
  }

  return new Response(null, { status: 204, headers: CORS_HEADERS });
});
