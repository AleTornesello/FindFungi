// Port of scraper/src/scraper/translations.py: keep the two in sync.
//
// For each language, `terms` maps every English term of a field (the JSON key) to
// its translation, and compound values are translated part by part:
// "convex or flat" joins the parts with `separators.or`, "white to cream" fills
// the `separators.to` pattern. Source notes such as "(iucn 3.1)" are kept as they are.

type Separator = "or" | "and" | "to";

interface Language {
  separators: Record<Separator, (a: string, b: string) => string>;
  terms: Record<string, Record<string, string>>;
}

// Same separators the app splits values on for the filter options.
const SEPARATOR = /\s+(or|and|to)\s+/;
// "vulnerable (iucn 3.1)": the status is translated, the source is not.
const SOURCE_NOTE = /^(.*?)(\s*\([^)]*\))$/;

export const FIELDS = [
  "cap",
  "hymenium",
  "lamella",
  "stipe",
  "gleba",
  "sporePrint",
  "ecology",
  "conservationStatus",
] as const;

export const LANGUAGES: Record<string, Language> = {
  it: {
    separators: {
      or: (a, b) => `${a} o ${b}`,
      and: (a, b) => `${a} e ${b}`,
      to: (a, b) => `da ${a} a ${b}`,
    },
    // Mostly the terms of it.wikipedia's Template:Fungo (see stage 5).
    terms: {
      cap: {
        "acute conical": "conico-acuto",
        "acute umbonate": "umbonato-acuto",
        "blunt conical": "conico-ottuso",
        "campanulate": "campanulato",
        "campanulate-conical": "campanulato-conico",
        "conical": "conico",
        "conical then flat": "prima conico poi allargato",
        "convex": "convesso",
        "cylindrical": "cilindrico",
        "depressed": "depresso",
        "flat": "piatto",
        "hemispherical": "semisferico",
        "indistinct": "indistinto",
        "infundibuliform": "infundibuliforme",
        "no distinct cap": "senza cappello distinto",
        "offset": "mensoliforme",
        "ovate": "ovoideo",
        "umbilicate": "ombelicato",
        "umbonate": "umbonato",
        "undulate": "ondulato",
      },
      hymenium: {
        "gills": "lamelle",
        "glebal": "gleba",
        "pores": "pori",
        "ridges": "pseudolamelle",
        "smooth": "liscio",
        "teeth": "aculei",
      },
      lamella: {
        "adnate": "adnate",
        "adnexed": "annesse",
        "decurrent": "decorrenti",
        "emarginate": "smarginate",
        "free": "libere",
        "irregular": "irregolari",
        "not applicable": "non applicabile",
        "seceding": "secedenti",
        "sinuate": "sinuate",
        "subdecurrent": "subdecorrenti",
        "uncinate": "uncinate",
      },
      stipe: {
        "bare": "nudo",
        "cortina": "cortina",
        "no stipe": "senza gambo",
        "ring": "anello",
        "volva": "volva",
      },
      gleba: {
        "staining": "virante",
        "unchanging": "immutabile",
      },
      sporePrint: {
        "black": "nera",
        "blackish-brown": "bruno-nerastra",
        "brown": "marrone",
        "buff": "camoscio",
        "cream": "crema",
        "green": "verde",
        "ochre": "ocra",
        "olive": "oliva",
        "olive-brown": "marrone-oliva",
        "pink": "rosa",
        "pinkish-brown": "bruno-rosata",
        "purple": "porpora",
        "purple-black": "nero-porpora",
        "purple-brown": "bruno-porpora",
        "reddish-brown": "bruno-rossastra",
        "salmon": "salmone",
        "tan": "fulva",
        "white": "bianca",
        "yellow": "gialla",
        "yellow-brown": "bruno-giallastra",
      },
      ecology: {
        "mycorrhizal": "micorrizico",
        "parasitic": "parassita",
        "saprotrophic": "saprofita",
      },
      conservationStatus: {
        "apparently secure": "apparentemente sicura",
        "critically endangered": "in pericolo critico",
        "data deficient": "dati insufficienti",
        "endangered": "in pericolo",
        "extinct": "estinta",
        "extinct in the wild": "estinta in natura",
        "least concern": "rischio minimo",
        "near threatened": "prossima alla minaccia",
        "not evaluated": "non valutata",
        "secure": "sicura",
        "vulnerable": "vulnerabile",
      },
    },
  },
};

/** `value` of `field` in `language`, or null if a term is not in the dictionary. */
export function translate(language: string, field: string, value: string): string | null {
  const config = LANGUAGES[language];
  const terms = config.terms[field] ?? {};

  let note = "";
  const match = SOURCE_NOTE.exec(value);
  if (match) [, value, note] = match;

  // parts at even indexes, separators at odd ones
  const tokens = value.split(SEPARATOR);
  const parts = tokens.filter((_, i) => i % 2 === 0).map((part) => terms[part]);
  if (parts.some((part) => part === undefined)) return null;
  const separators = tokens.filter((_, i) => i % 2 === 1) as Separator[];
  let result = parts[0];
  separators.forEach((separator, i) => {
    result = config.separators[separator](result, parts[i + 1]);
  });
  return result + note;
}

/** The value itself and the single terms the app offers as filter options. */
function options(value: string): string[] {
  const base = value.replace(SOURCE_NOTE, "$1");
  return [value, base, ...value.split(SEPARATOR).filter((_, i) => i % 2 === 0)];
}

export type Translations = Record<string, Record<string, Record<string, string>>>;

/**
 * Per language and field, the translation of every value (and part) in the export.
 *
 * Returns the translations and the "language/field/value" triples left out.
 */
export function buildTranslations(
  mushrooms: { properties: Record<string, unknown> }[],
): { translations: Translations; missing: string[] } {
  const values: Record<string, Set<string>> = {};
  for (const field of FIELDS) values[field] = new Set();
  for (const mushroom of mushrooms) {
    for (const field of FIELDS) {
      const value = mushroom.properties[field];
      if (typeof value === "string" && value) {
        for (const option of options(value)) values[field].add(option);
      }
    }
  }

  const missing: string[] = [];
  const translations: Translations = {};
  for (const language of Object.keys(LANGUAGES)) {
    const byField: Record<string, Record<string, string>> = (translations[language] = {});
    for (const field of FIELDS) {
      const byValue: Record<string, string> = (byField[field] = {});
      for (const value of [...values[field]].sort()) {
        const translated = translate(language, field, value);
        if (translated === null) missing.push(`${language}/${field}/${value}`);
        else byValue[value] = translated;
      }
    }
  }
  return { translations, missing };
}
