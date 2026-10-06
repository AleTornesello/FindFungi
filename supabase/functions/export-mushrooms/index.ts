// Exports the `mushrooms` table in the format of data/mushrooms.json, like stage 7
// of the scraper (scraper/src/scraper/stages/export_json.py):
//
// - `mushrooms`: the row id, a `taxonomy` and a `properties` object, keys in
//   camelCase. `properties.images` lists the Wikipedia cover image first, then the
//   funghiitaliani.it topic photos in page order.
// - `translations`: per language and property, the translation of every English
//   characteristic value in the export.
//
// The values left without a translation are listed in the `X-Missing-Translations`
// response header (count) and in the function logs.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.7";
import { buildTranslations } from "./translations.ts";

// The app calls the function from the browser, on another origin.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Expose-Headers": "X-Missing-Translations",
};

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { max: 1, prepare: false });

interface Row {
  id: number;
  kingdom: string;
  division: string;
  taxon_class: string;
  taxon_order: string;
  family: string;
  genus: string;
  species: string;
  common_name_it: string;
  common_name_en: string;
  edible: boolean;
  poisonous: boolean;
  toxicity_effect_it: string;
  microscopic: boolean;
  cap: string;
  hymenium: string;
  lamella: string;
  stipe: string;
  gleba: string;
  spore_print: string;
  ecology: string;
  conservation_status: string;
  cover_image: string;
  photos: string[];
}

function toJson(row: Row) {
  return {
    id: row.id,
    taxonomy: {
      kingdom: row.kingdom,
      division: row.division,
      class: row.taxon_class,
      order: row.taxon_order,
      family: row.family,
      genus: row.genus,
      species: row.species,
    },
    properties: {
      commonNameIt: row.common_name_it,
      commonNameEn: row.common_name_en,
      edible: row.edible,
      poisonous: row.poisonous,
      toxicityEffectIt: row.toxicity_effect_it,
      microscopic: row.microscopic,
      cap: row.cap,
      hymenium: row.hymenium,
      lamella: row.lamella,
      stipe: row.stipe,
      gleba: row.gleba,
      sporePrint: row.spore_print,
      ecology: row.ecology,
      conservationStatus: row.conservation_status,
      images: images(row),
    },
  };
}

/** The Wikipedia cover image, then the funghiitaliani.it photos, without repeats. */
function images(row: Row): string[] {
  return [...new Set([row.cover_image, ...row.photos].filter(Boolean))];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "GET") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { ...CORS_HEADERS, Allow: "GET, OPTIONS" },
    });
  }

  let rows: Row[];
  try {
    rows = await sql<Row[]>`
      SELECT
          id, kingdom, division, taxon_class, taxon_order, family, genus, species,
          common_name_it, common_name_en, edible, poisonous, toxicity_effect_it, microscopic,
          cap, hymenium, lamella, stipe, gleba, spore_print, ecology, conservation_status,
          cover_image,
          ARRAY(
              SELECT p.url FROM funghi_italiani_photos p
              WHERE p.topic_id = m.funghi_italiani_topic_id
              ORDER BY p.position
          ) AS photos
      FROM mushrooms m
      ORDER BY genus, species, id
    `;
  } catch (e) {
    console.error("Export query failed:", e);
    return Response.json({ error: "Could not read the mushrooms" }, { status: 500, headers: CORS_HEADERS });
  }

  const mushrooms = rows.map(toJson);
  const { translations, missing } = buildTranslations(mushrooms);
  if (missing.length) {
    console.warn(`${missing.length} values have no translation:`, missing.join(", "));
  }

  const download = new URL(req.url).searchParams.has("download");
  return new Response(JSON.stringify({ mushrooms, translations }, null, 2) + "\n", {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "X-Missing-Translations": String(missing.length),
      ...(download && { "Content-Disposition": 'attachment; filename="mushrooms.json"' }),
    },
  });
});
