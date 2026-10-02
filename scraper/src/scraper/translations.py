"""Translations of the mushrooms characteristics, exported with the data by stage 7.

The database keeps the English vocabulary produced by stage 5; the app filters on
those values and shows them translated when a dictionary for its language exists.
For each language, `terms` maps every English term of a field (the JSON key) to
its translation, and compound values are translated part by part:
"convex or flat" joins the parts with `separators["or"]`, "white to cream" fills
the `separators["to"]` pattern. Source notes such as "(IUCN 3.1)" are kept as they are.

To add a language, add an entry to LANGUAGES with the same fields. Terms missing
from a dictionary are left out of the export (the app shows them in English) and
reported by `build_translations`, so the dictionaries can be completed.
"""

import re
from collections.abc import Iterable

# Same separators the app splits values on for the filter options.
SEPARATOR = re.compile(r"\s+(or|and|to)\s+")
# "Vulnerable (IUCN 3.1)": the status is translated, the source is not.
SOURCE_NOTE = re.compile(r"^(.*?)(\s*\([^)]*\))$")

FIELDS = ("cap", "hymenium", "lamella", "stipe", "gleba", "sporePrint", "ecology", "conservationStatus")

LANGUAGES: dict[str, dict] = {
    "it": {
        "separators": {"or": "{} o {}", "and": "{} e {}", "to": "da {} a {}"},
        # Mostly the terms of it.wikipedia's Template:Fungo (see stage 5).
        "terms": {
            "cap": {
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
            "hymenium": {
                "gills": "lamelle",
                "glebal": "gleba",
                "pores": "pori",
                "ridges": "pseudolamelle",
                "smooth": "liscio",
                "teeth": "aculei",
            },
            "lamella": {
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
            "stipe": {
                "bare": "nudo",
                "cortina": "cortina",
                "no stipe": "senza gambo",
                "ring": "anello",
                "volva": "volva",
            },
            "gleba": {
                "staining": "virante",
                "unchanging": "immutabile",
            },
            "sporePrint": {
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
            "ecology": {
                "mycorrhizal": "micorrizico",
                "parasitic": "parassita",
                "saprotrophic": "saprofita",
            },
            "conservationStatus": {
                "Apparently Secure": "Apparentemente sicura",
                "Endangered": "In pericolo",
                "Least Concern": "Rischio minimo",
                "Near Threatened": "Prossima alla minaccia",
                "Not Evaluated": "Non valutata",
                "Secure": "Sicura",
                "Vulnerable": "Vulnerabile",
            },
        },
    },
}


def translate(language: str, field: str, value: str) -> str | None:
    """`value` of `field` in `language`, or None if a term is not in the dictionary."""
    config = LANGUAGES[language]
    terms = config["terms"].get(field, {})

    note = ""
    if match := SOURCE_NOTE.match(value):
        value, note = match.groups()

    # parts at even indexes, separators at odd ones
    tokens = SEPARATOR.split(value)
    parts = [terms.get(part) for part in tokens[::2]]
    if any(part is None for part in parts):
        return None
    result = parts[0]
    for separator, part in zip(tokens[1::2], parts[1:]):
        result = config["separators"][separator].format(result, part)
    return result + note


def options(value: str) -> list[str]:
    """The value itself and the single terms the app offers as filter options."""
    base = SOURCE_NOTE.sub(r"\1", value)
    return [value, base, *SEPARATOR.split(value)[::2]]


def build_translations(mushrooms: Iterable[dict]) -> tuple[dict, set[tuple[str, str, str]]]:
    """Per language and field, the translation of every value (and part) in the export.

    Returns the translations and the (language, field, value) triples left out.
    """
    values = {field: set() for field in FIELDS}
    for mushroom in mushrooms:
        for field in FIELDS:
            if value := mushroom["properties"][field]:
                values[field].update(options(value))

    missing: set[tuple[str, str, str]] = set()
    translations: dict[str, dict[str, dict[str, str]]] = {}
    for language in LANGUAGES:
        by_field = translations[language] = {}
        for field in FIELDS:
            by_value = by_field[field] = {}
            for value in sorted(values[field]):
                translated = translate(language, field, value)
                if translated is None:
                    missing.add((language, field, value))
                else:
                    by_value[value] = translated
    return translations, missing
