// Stores a find that a user chose to share anonymously from the "My finds" page in
// `shared_finds`. The table has no policies, so the browser writes through this
// function rather than the Data API.
//
// POST JSON: { mushroomId?, scientificName, date: "YYYY-MM-DD", position?: { latitude,
// longitude, accuracy } }. Only these fields are stored: nothing about the user or device.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.7";

// The app calls the function from the browser, on another origin.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { max: 1, prepare: false });

interface SharedFind {
  mushroomId: number | null;
  scientificName: string;
  date: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
}

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The find in `body`, or undefined if it is malformed. Ranges are left to the table's checks. */
function parse(body: unknown): SharedFind | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const { mushroomId, scientificName, date, position } = body as Record<string, unknown>;
  if (mushroomId !== undefined && mushroomId !== null && !Number.isInteger(mushroomId)) return undefined;
  if (typeof scientificName !== "string" || typeof date !== "string") return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;

  let latitude = null, longitude = null, accuracy = null;
  if (position !== undefined && position !== null) {
    const p = position as Record<string, unknown>;
    if (!isNumber(p.latitude) || !isNumber(p.longitude)) return undefined;
    if (p.accuracy !== undefined && !isNumber(p.accuracy)) return undefined;
    ({ latitude, longitude } = p);
    accuracy = p.accuracy ?? null;
  }
  return {
    mushroomId: (mushroomId as number | undefined) ?? null,
    scientificName: scientificName.trim(),
    date,
    latitude,
    longitude,
    accuracy: accuracy as number | null,
  };
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

  let find: SharedFind | undefined;
  try {
    find = parse(await req.json());
  } catch {
    // Not JSON.
  }
  if (!find) return badRequest("Expected a find as JSON");

  try {
    // A day of slack on the date for time zones ahead of the server's.
    const inserted = await sql`
      INSERT INTO shared_finds (mushroom_id, scientific_name, found_on, latitude, longitude, accuracy_m)
      SELECT ${find.mushroomId}, ${find.scientificName}, ${find.date}::date,
             ${find.latitude}, ${find.longitude}, ${find.accuracy}
      WHERE ${find.date}::date <= current_date + 1
      RETURNING id
    `;
    if (inserted.length === 0) return badRequest("The date is in the future");
  } catch (e) {
    // Check, foreign key and date format violations: the find itself is invalid.
    const code = (e as { code?: string }).code;
    if (code === "23514" || code === "23503" || code?.startsWith("22")) return badRequest("Invalid find");
    console.error("Insert failed:", e);
    return Response.json({ error: "Could not share the find" }, { status: 500, headers: CORS_HEADERS });
  }

  return new Response(null, { status: 204, headers: CORS_HEADERS });
});
