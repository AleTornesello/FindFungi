"""Stage 5: translate the mushrooms characteristics to a common English vocabulary.

Stage 4 fills these columns from the Italian page when there is one, so they mix
Italian ("convesso") and English ("convex") values. Each column has a dictionary
from every known value (lowercase) to its English form; English values map to
themselves, so the stage can run again safely. Compound values such as
"convex or flat" or "white to cream" are translated part by part.

Values missing from the dictionaries are left unchanged and printed, so the
dictionaries can be extended.
"""

import re
from collections import Counter

import psycopg
from psycopg import sql
from rich.console import Console
from rich.table import Table

from scraper.config import ConfigError, load_db_config
from scraper.db import connect, table_exists

TABLE = "mushrooms"


def _english(*terms: str) -> dict[str, str]:
    """Entries for values that are already in English."""
    return {term.lower(): term for term in terms}


# Italian terms follow it.wikipedia's Template:Fungo, English ones the
# Mycomorphbox of en.wikipedia. "ND" (not determined) becomes empty.
DICTIONARIES: dict[str, dict[str, str]] = {
    "cap": {
        "campanulato": "campanulate",
        "campanulato-conico": "campanulate-conical",
        "cilindrico": "cylindrical",
        "conico-acuto": "acute conical",
        "conico-ottuso": "blunt conical",
        "convesso": "convex",
        "infundibuliforme": "infundibuliform",
        "mensoliforme": "offset",  # shelf-like, as in bracket fungi
        "no": "no distinct cap",
        "nd": "",
        "ondulato": "undulate",
        "ovoideo": "ovate",
        "prima conico poi allargato": "conical then flat",
        "semisferico": "hemispherical",
        "umbellato": "umbilicate",  # the template shows the umbilicate cap icon
        "umbonato-acuto": "acute umbonate",
        "umbonato-ottuso": "umbonate",
        **_english(
            "campanulate", "conical", "convex", "depressed", "flat", "indistinct",
            "infundibuliform", "no distinct cap", "offset", "ovate", "umbilicate",
            "umbonate",
            # values produced by the translations above
            "acute conical", "acute umbonate", "blunt conical", "campanulate-conical",
            "conical then flat", "cylindrical", "hemispherical", "undulate",
        ),
    },
    "hymenium": {
        "aculei": "teeth",
        "creste": "ridges",
        "lamelle": "gills",
        "liscio": "smooth",
        "pori": "pores",
        "pseudolamelle": "ridges",  # false gills
        **_english("gills", "glebal", "pores", "ridges", "smooth", "teeth"),
    },
    "lamella": {
        "annesse": "adnexed",
        "decorrenti": "decurrent",
        "libere": "free",
        "no": "not applicable",
        "nd": "",
        "subdecorrenti": "subdecurrent",
        **_english(
            "adnate", "adnexed", "decurrent", "emarginate", "free", "irregular",
            "not applicable", "seceding", "sinuate", "subdecurrent", "uncinate",
        ),
    },
    "stipe": {
        "anello": "ring",
        "anello e volva": "ring and volva",
        "nudo": "bare",
        "nd": "",
        "presenza di anello membranoso, fragile e sottile": "ring",
        # English Mycomorphbox sentences, also as parts of "X or Y"
        "has a cortina": "cortina",
        "has a ring": "ring",
        "is bare": "bare",
        "lacks a stipe": "no stipe",
        "stipe has a cortina": "cortina",
        "stipe has a ring": "ring",
        "stipe has a ring and volva": "ring and volva",
        "stipe has a volva": "volva",
        **_english("bare", "cortina", "no stipe", "ring", "ring and volva", "volva"),
    },
    "gleba": {
        "immutabile": "unchanging",
        "virante": "staining",  # changes colour when cut
        **_english("staining", "unchanging"),
    },
    "spore_print": {
        "bianca": "white",
        "crema": "cream",
        "gialla": "yellow",
        "marrone": "brown",
        "marrone-oliva": "olive-brown",
        "nera": "black",
        "ocra": "ochre",
        "oliva": "olive",
        "porpora": "purple",
        "rosa": "pink",
        "salmone": "salmon",
        **_english(
            "black", "blackish-brown", "brown", "buff", "cream", "green", "ochre",
            "olive", "olive-brown", "pink", "pinkish-brown", "purple", "purple-black",
            "purple-brown", "reddish-brown", "salmon", "tan", "white", "yellow",
            "yellow-brown",
        ),
    },
    "ecology": {
        "micorrizico": "mycorrhizal",
        "parassita": "parasitic",
        "saprofita": "saprotrophic",
        "simbionte": "mycorrhizal",
        **_english("mycorrhizal", "parasitic", "saprotrophic"),
    },
    "conservation_status": {
        "prossimo alla minaccia (nt)": "Near Threatened",
        "rischio minimo": "Least Concern",
        "specie non valutata": "Not Evaluated",
        "vulnerabile": "Vulnerable",
        **_english(
            "Apparently Secure (NatureServe)", "Endangered (IUCN 3.1)",
            "Least Concern (IUCN 3.1)", "Near Threatened (IUCN 3.1)",
            "Secure (NatureServe)", "Vulnerable (IUCN 3.1)", "Vulnerable (NatureServe)",
            "Least Concern", "Near Threatened", "Not Evaluated", "Vulnerable",
        ),
    },
}

# Leftover image markup of free-text values, e.g. "cortina [[File:|35px]]".
WIKI_FILE = re.compile(r"\[\[File:[^\]]*\]\]")
# "convex or flat", "white to cream": translate each part.
SEPARATOR = re.compile(r"\s+(or|to)\s+")

console = Console()


def run() -> None:
    try:
        config = load_db_config()
    except ConfigError as e:
        console.print(f"[red]{e}[/red]")
        return

    console.print(f"Connecting to [cyan]{config.display}[/cyan]...")
    try:
        with connect(config) as conn:
            if not table_exists(conn, TABLE):
                console.print(f"[red]Table '{TABLE}' does not exist. Run stage 1 first.[/red]")
                return
            _normalize_table(conn)
    except psycopg.OperationalError as e:
        console.print(f"[red]Could not connect to the database:[/red] {e}")


def _normalize_table(conn: psycopg.Connection) -> None:
    columns = list(DICTIONARIES)
    query = sql.SQL("SELECT id, {} FROM {} ORDER BY id").format(
        sql.SQL(", ").join(map(sql.Identifier, columns)), sql.Identifier(TABLE)
    )
    rows = conn.execute(query).fetchall()

    unknown: Counter[tuple[str, str]] = Counter()
    updates: list[tuple[int, dict[str, str]]] = []
    for id_, *values in rows:
        changes = {}
        for column, value in zip(columns, values):
            normalized = normalize(column, value)
            if normalized is None:
                unknown[column, value] += 1
            elif normalized != value:
                changes[column] = normalized
        if changes:
            updates.append((id_, changes))

    with conn.transaction(), conn.cursor() as cur:
        for id_, changes in updates:
            cur.execute(
                sql.SQL("UPDATE {} SET {}, updated_at = now() WHERE id = %s").format(
                    sql.Identifier(TABLE),
                    sql.SQL(", ").join(
                        sql.SQL("{} = %s").format(sql.Identifier(column)) for column in changes
                    ),
                ),
                [*changes.values(), id_],
            )
    console.print(f"[green]Normalized {len(updates)} of {len(rows)} rows.[/green]")

    if unknown:
        console.print(
            f"[yellow]{len(unknown)} values are not in the dictionary "
            "and were left unchanged:[/yellow]"
        )
        table = Table()
        table.add_column("Column")
        table.add_column("Value")
        table.add_column("Rows", justify="right")
        for (column, value), count in sorted(unknown.items()):
            table.add_row(column, value, str(count))
        console.print(table)


def normalize(column: str, value: str) -> str | None:
    """English form of `value` for `column`, or None if it is not in the dictionary."""
    dictionary = DICTIONARIES[column]
    text = " ".join(WIKI_FILE.sub("", value).split()).lower()
    if not text:
        return ""
    if text in dictionary:
        return dictionary[text]

    # parts at even indexes, separators ("or", "to") at odd ones
    tokens = SEPARATOR.split(text)
    parts = tokens[::2]
    if len(parts) == 1 or any(part not in dictionary for part in parts):
        return None
    tokens[::2] = [dictionary[part] for part in parts]
    return " ".join(token for token in tokens if token)
