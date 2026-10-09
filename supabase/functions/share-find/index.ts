// Stores a find from the "My finds" page in `shared_finds`: anonymously when the
// request comes with the anon key, or with the user's id when it comes with a
// signed-in user's token. The table has no policies, so the browser writes
// through this function rather than the Data API.
//
// POST JSON: { mushroomId?, scientificName, date: "YYYY-MM-DD", position?: { latitude,
// longitude, accuracy }, photoPath? }. Only these fields and the user id from the token
// are stored: nothing else about the user or device. `photoPath` is the find's photo in the
// find-photos bucket, which only signed-in users upload to, in their own folder.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import postgres from "npm:postgres@3.4.7";

// The app calls the function from the browser, on another origin.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { max: 1, prepare: false });

const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, ANON_KEY);

interface SharedFind {
  mushroomId: number | null;
  scientificName: string;
  date: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  photoPath: string | null;
}

/** `<user id>/<find id>.jpg`, as the app names the photos it uploads. */
const PHOTO_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/;

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The find in `body`, or undefined if it is malformed. Ranges are left to the table's checks. */
function parse(body: unknown): SharedFind | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const { mushroomId, scientificName, date, position, photoPath } = body as Record<string, unknown>;
  if (mushroomId !== undefined && mushroomId !== null && !Number.isInteger(mushroomId)) return undefined;
  if (typeof scientificName !== "string" || typeof date !== "string") return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  if (photoPath !== undefined && photoPath !== null && (typeof photoPath !== "string" || !PHOTO_PATH.test(photoPath))) {
    return undefined;
  }

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
    photoPath: (photoPath as string | undefined) ?? null,
  };
}

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

  let find: SharedFind | undefined;
  try {
    find = parse(await req.json());
  } catch {
    // Not JSON.
  }
  if (!find) return badRequest("Expected a find as JSON");

  const userId = await requestUser(req);
  if (userId === undefined) {
    return Response.json({ error: "Invalid session" }, { status: 401, headers: CORS_HEADERS });
  }
  // Storage policies only let users upload to their own folder: a path elsewhere isn't theirs.
  if (find.photoPath && !find.photoPath.startsWith(`${userId}/`)) return badRequest("Not your photo");

  try {
    // A day of slack on the date for time zones ahead of the server's.
    const inserted = await sql`
      INSERT INTO shared_finds (mushroom_id, scientific_name, found_on, latitude, longitude, accuracy_m,
                                user_id, photo_path)
      SELECT ${find.mushroomId}, ${find.scientificName}, ${find.date}::date,
             ${find.latitude}, ${find.longitude}, ${find.accuracy}, ${userId}, ${find.photoPath}
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
