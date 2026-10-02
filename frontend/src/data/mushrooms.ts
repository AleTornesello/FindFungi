/** In dev the Vite server serves the repo's own data/mushrooms.json (see vite.config.ts). */
export const MUSHROOMS_URL = import.meta.env.DEV
  ? "/data/mushrooms.json"
  : "https://raw.githubusercontent.com/AleTornesello/FindFungi/refs/heads/master/data/mushrooms.json";

/** Re-download the dataset once the local copy is this old; in dev, on every launch, to pick up new exports. */
export const RESYNC_AFTER_MS = import.meta.env.DEV
  ? 0
  : 7 * 24 * 60 * 60 * 1000;

export interface Mushroom {
  id: number;
  taxonomy: {
    kingdom: string;
    division: string;
    class: string;
    order: string;
    family: string;
    genus: string;
    species: string;
  };
  properties: {
    edible: boolean;
    microscopic: boolean;
    cap: string;
    hymenium: string;
    lamella: string;
    stipe: string;
    gleba: string;
    sporePrint: string;
    ecology: string;
    conservationStatus: string;
    coverImage: string;
  };
}

/**
 * Characteristic values are English; the dataset carries their translations per language
 * and property, e.g. `it.cap["convex or flat"] === "convesso o piatto"`.
 */
export type ValueTranslations = Record<
  string,
  Partial<Record<keyof Mushroom["properties"], Record<string, string>>>
>;

export interface MushroomData {
  mushrooms: Mushroom[];
  translations: ValueTranslations;
}

export const scientificName = (m: Mushroom) =>
  `${m.taxonomy.genus} ${m.taxonomy.species}`.trim();

export const speciesPath = (m: Mushroom) => `/species/${m.id}`;

/** Rejects payloads that would break the UI, so a bad download never replaces a good local copy. */
export function parseMushrooms(data: unknown): MushroomData {
  // Older exports were a bare list, without translations.
  const { mushrooms, translations = {} } = (
    Array.isArray(data) ? { mushrooms: data } : (data ?? {})
  ) as {
    mushrooms?: unknown;
    translations?: unknown;
  };
  if (!Array.isArray(mushrooms) || mushrooms.length === 0)
    throw new Error("Mushroom data is empty or not a list");
  for (const m of mushrooms) {
    if (
      typeof m?.id !== "number" ||
      typeof m?.taxonomy?.genus !== "string" ||
      typeof m?.properties !== "object"
    ) {
      throw new Error("Mushroom data has an unexpected shape");
    }
  }
  if (typeof translations !== "object" || translations === null) {
    throw new Error("Mushroom translations have an unexpected shape");
  }
  return {
    mushrooms: mushrooms as Mushroom[],
    translations: translations as ValueTranslations,
  };
}
