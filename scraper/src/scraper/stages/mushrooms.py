"""Stage 5: fill the `mushrooms` table from funghiitaliani.it and the Wikipedia infoboxes.

Every `funghi_italiani` record becomes a row. Each rank of the taxonomy comes from the
first source that gives it: the species card of its funghiitaliani.it topic (see
stage 3), the grid record, then the taxobox of its Wikipedia page; edibility, toxicity
and its effect come from the grid record. When the record has a Wikipedia page (see
stage 4), the morphological properties, conservation status, cover image and common
names come from the Italian page, or from the English one when there is no Italian
page; records without any page keep them empty. The edibility of the page overrides the
funghi_italiani one when it is more dangerous (poisonous > not edible > edible).

Pages are fetched through the Firecrawl API, which returns only the infobox
tables and the lead paragraphs; each page is scraped once even if several records
point to it. Rows are committed in small batches, so an interrupted run can be resumed.
"""

import re
from concurrent.futures import Future, ThreadPoolExecutor, as_completed
from dataclasses import dataclass

import psycopg
import questionary
from bs4 import BeautifulSoup, Tag
from psycopg.rows import dict_row
from rich.console import Console
from rich.progress import BarColumn, MofNCompleteColumn, Progress, TextColumn

from scraper.config import ConfigError, load_db_config, load_firecrawl_config
from scraper.db import connect, migrate, row_count, table_exists
from scraper.firecrawl import Firecrawl, FirecrawlError, FirecrawlFatalError

TABLE = "mushrooms"
TOPICS_TABLE = "funghi_italiani_topics"
REQUIRED_TABLES = ("funghi_italiani", TOPICS_TABLE, "wikipedia_pages", TABLE)
PAGE_URL = "https://{lang}.wikipedia.org/?curid={page_id}"
INFOBOX_SELECTOR = "table.infobox"
# Paragraphs before the first heading: Firecrawl returns the Parsoid HTML, where
# every section is a <section> element.
LEAD_SELECTOR = 'section[data-mw-section-id="0"] > p'
COMMIT_EVERY = 25

COVER_WIDTH = 500
UPLOAD_HOST = "https://upload.wikimedia.org"
# Infobox images that are never a cover image, as returned by _image_url.
COVER_BLACKLIST = {
    "https://upload.wikimedia.org/wikipedia/commons/a/a1/Convex_cap_icon.svg",
}
THUMB_URL = re.compile(r"^https://[^/]+(/wikipedia/[^/]+)/thumb/(.+)/\d+px-([^/]+)$")

# funghiitaliani.it edibility codes counted as edible (C: edible, C1: edible
# with caution); N, V, M and '' are not.
EDIBLE_CODES = {"C", "C1"}

# Edibility levels, from the safest to the most dangerous: when funghiitaliani.it
# and Wikipedia disagree, the more dangerous one wins.
EDIBLE, INEDIBLE, POISONOUS = 0, 1, 2

# Keywords of the Wikipedia edibility row ("Commestibilità" on Italian pages,
# "Edibility is ..." on English ones), from the most dangerous level down. A value
# can list several, e.g. "edible or poisonous", "edible but not recommended": the
# first level with a match wins, so it is the most dangerous one. "ignota" and
# "unknown" match nothing and leave the funghiitaliani.it data unchanged.
EDIBILITY_KEYWORDS = (
    (POISONOUS, ("velenos", "mortale", "tossic", "psicoattiv", "allucinogen",
                 "poisonous", "deadly", "toxic", "psychoactive")),
    (INEDIBLE, ("non commestibile", "sconsigliat", "sospett", "privo di valore",
                "inedible", "not recommended", "too hard", "allergic")),
    (EDIBLE, ("commestibil", "edible", "choice")),
)

TAXONOMY = ("kingdom", "division", "taxon_class", "taxon_order", "family")
# Row labels of the "Scientific classification" box, by language; the colon of the
# English ones ("Kingdom:") is dropped first.
TAXOBOX_LABELS = {
    "it": {
        "Regno": "kingdom",
        "Divisione": "division",
        "Phylum": "division",
        "Classe": "taxon_class",
        "Ordine": "taxon_order",
        "Famiglia": "family",
    },
    "en": {
        "Kingdom": "kingdom",
        "Division": "division",
        "Phylum": "division",
        "Class": "taxon_class",
        "Order": "taxon_order",
        "Family": "family",
    },
}
# The name at the start of a taxobox value, without the author or notes after it.
TAXON_NAME = re.compile(r"[A-Za-z]+")
# Kingdom of the divisions, for the records whose card, grid record and Wikipedia
# page all lack it.
DIVISION_KINGDOMS = {
    "Ascomycota": "Fungi",
    "Basidiomycota": "Fungi",
    "Mucoromycota": "Fungi",
    "Zygomycota": "Fungi",
    "Amoebozoa": "Protozoa",
    "Mycetozoa": "Protozoa",
    "Myxomycota": "Protozoa",
}

PROPERTIES = ("cap", "hymenium", "lamella", "stipe", "gleba", "spore_print", "ecology")
# The Wikipedia data of a record without a page.
NO_PAGE_DATA = dict.fromkeys(
    (*PROPERTIES, "conservation_status", "cover_image", "common_name_it", "common_name_en"), ""
)

# Row labels of the Italian "Caratteristiche morfologiche" box. Velo and Carne
# map to stipe and gleba to keep the structure of data/8.json.
IT_LABELS = {
    "Cappello": "cap",
    "Imenio": "hymenium",
    "Lamelle": "lamella",
    "Sporata": "spore_print",
    "Velo": "stipe",
    "Carne": "gleba",
    "Ecologia": "ecology",
}

IT_EDIBILITY_LABEL = "Commestibilità"

# Italian taxobox header; the common names are in the row after it.
IT_COMMON_NAMES_HEADER = "Nomi comuni"
FOREIGN_NAMES = re.compile(r"^\s*\(\s*[A-Za-z]{2,3}\s*\)")

INFOBOX_HEADERS = {
    "it": ("Classificazione scientifica", "Caratteristiche morfologiche", "Stato di conservazione"),
    "en": ("Scientific classification", "Mycological characteristics", "Conservation status"),
}

MISSING = "Scrape only mushrooms not saved yet"
ALL = "Scrape all mushrooms again"
CANCEL = "Cancel"

INSERT_SQL = f"""
INSERT INTO {TABLE} (
    funghi_italiani_id, funghi_italiani_topic_id, wikipedia_it_page_id, wikipedia_en_page_id,
    kingdom, division, taxon_class, taxon_order, family, genus, species,
    common_name_it, common_name_en,
    edible, poisonous, toxicity_effect_it, microscopic, cap, hymenium, lamella, stipe, gleba,
    spore_print, ecology, conservation_status, cover_image
) VALUES (
    %(funghi_italiani_id)s, %(funghi_italiani_topic_id)s, %(wikipedia_it_page_id)s,
    %(wikipedia_en_page_id)s, %(kingdom)s, %(division)s, %(taxon_class)s, %(taxon_order)s,
    %(family)s, %(genus)s, %(species)s, %(common_name_it)s, %(common_name_en)s,
    %(edible)s, %(poisonous)s, %(toxicity_effect_it)s,
    %(microscopic)s, %(cap)s, %(hymenium)s, %(lamella)s, %(stipe)s, %(gleba)s,
    %(spore_print)s, %(ecology)s, %(conservation_status)s, %(cover_image)s
)
ON CONFLICT (funghi_italiani_id) DO UPDATE SET
    funghi_italiani_topic_id = EXCLUDED.funghi_italiani_topic_id,
    wikipedia_it_page_id = EXCLUDED.wikipedia_it_page_id,
    wikipedia_en_page_id = EXCLUDED.wikipedia_en_page_id,
    kingdom = EXCLUDED.kingdom,
    division = EXCLUDED.division,
    taxon_class = EXCLUDED.taxon_class,
    taxon_order = EXCLUDED.taxon_order,
    family = EXCLUDED.family,
    genus = EXCLUDED.genus,
    species = EXCLUDED.species,
    common_name_it = EXCLUDED.common_name_it,
    common_name_en = EXCLUDED.common_name_en,
    edible = EXCLUDED.edible,
    poisonous = EXCLUDED.poisonous,
    toxicity_effect_it = EXCLUDED.toxicity_effect_it,
    microscopic = EXCLUDED.microscopic,
    cap = EXCLUDED.cap,
    hymenium = EXCLUDED.hymenium,
    lamella = EXCLUDED.lamella,
    stipe = EXCLUDED.stipe,
    gleba = EXCLUDED.gleba,
    spore_print = EXCLUDED.spore_print,
    ecology = EXCLUDED.ecology,
    conservation_status = EXCLUDED.conservation_status,
    cover_image = EXCLUDED.cover_image,
    updated_at = now()
"""

console = Console()


@dataclass(frozen=True)
class Page:
    lang: str
    page_id: int

    @property
    def url(self) -> str:
        return PAGE_URL.format(lang=self.lang, page_id=self.page_id)


def run() -> None:
    try:
        db_config = load_db_config()
        firecrawl_config = load_firecrawl_config()
    except ConfigError as e:
        console.print(f"[red]{e}[/red]")
        return
    if not firecrawl_config.api_key:
        console.print(
            "[yellow]FIRECRAWL_API_KEY is not set: using keyless access, "
            "which has much lower rate limits.[/yellow]"
        )

    console.print(f"Connecting to [cyan]{db_config.display}[/cyan]...")
    try:
        with connect(db_config) as conn:
            for table in REQUIRED_TABLES:
                if not table_exists(conn, table):
                    console.print(
                        f"[red]Table '{table}' does not exist. Run stage 1 first.[/red]"
                    )
                    return
            migrate(conn, TOPICS_TABLE)
            migrate(conn, TABLE)
            conn.commit()

            only_missing = False
            count = row_count(conn, TABLE)
            if count:
                console.print(f"[yellow]Table '{TABLE}' already has {count} rows.[/yellow]")
                mode = questionary.select(
                    "Which mushrooms should be scraped?",
                    choices=[MISSING, ALL, CANCEL],
                    default=MISSING,
                ).ask()
                if mode in (None, CANCEL):
                    console.print("Cancelled.")
                    return
                only_missing = mode == MISSING

            records = load_records(conn, only_missing)
            if not records:
                console.print("[green]Nothing to scrape.[/green]")
                return

            firecrawl = Firecrawl(firecrawl_config)
            try:
                _scrape_and_save(conn, firecrawl, firecrawl_config.concurrency, records)
            finally:
                firecrawl.close()
    except psycopg.OperationalError as e:
        console.print(f"[red]Could not connect to the database:[/red] {e}")


def load_records(conn: psycopg.Connection, only_missing: bool) -> list[dict]:
    """funghi_italiani records, as dicts keyed like INSERT_SQL."""
    query = f"""
        SELECT
            f.id AS funghi_italiani_id,
            f.topic_id AS funghi_italiani_topic_id,
            it.page_id AS wikipedia_it_page_id,
            en.page_id AS wikipedia_en_page_id,
            f.kingdom, f.division, f.taxon_class, f.taxon_order, f.family,
            t.kingdom AS card_kingdom, t.division AS card_division,
            t.taxon_class AS card_taxon_class, t.taxon_order AS card_taxon_order,
            t.family AS card_family,
            f.genus, f.species, f.edibility, f.poisonous,
            f.toxicity AS toxicity_effect_it, f.microscopic
        FROM funghi_italiani f
        LEFT JOIN {TOPICS_TABLE} t ON t.topic_id = f.topic_id
        LEFT JOIN wikipedia_pages it ON it.funghi_italiani_id = f.id AND it.lang = 'it'
        LEFT JOIN wikipedia_pages en ON en.funghi_italiani_id = f.id AND en.lang = 'en'
    """
    if only_missing:
        query += f" WHERE NOT EXISTS (SELECT 1 FROM {TABLE} m WHERE m.funghi_italiani_id = f.id)"
    query += " ORDER BY f.id"

    with conn.cursor(row_factory=dict_row) as cur:
        records = cur.execute(query).fetchall()
    for record in records:
        record["edible"] = record.pop("edibility") in EDIBLE_CODES
        record["microscopic"] = bool(record["microscopic"])
    return records


def merge_taxonomy(record: dict, wikipedia: dict[str, str]) -> dict:
    """`record` with every rank taken from the first source that gives it: the topic
    card (the card_* keys, dropped), the grid record, then the Wikipedia taxobox. A
    kingdom none of them gives comes from the division."""
    merged = {key: value for key, value in record.items() if not key.startswith("card_")}
    for rank in TAXONOMY:
        merged[rank] = record[f"card_{rank}"] or record[rank] or wikipedia.get(rank, "")
    if not merged["kingdom"]:
        merged["kingdom"] = DIVISION_KINGDOMS.get(merged["division"], "")
    return merged


def _source_page(record: dict) -> Page | None:
    if record["wikipedia_it_page_id"] is not None:
        return Page("it", record["wikipedia_it_page_id"])
    if record["wikipedia_en_page_id"] is not None:
        return Page("en", record["wikipedia_en_page_id"])
    return None


def _scrape_and_save(
    conn: psycopg.Connection, firecrawl: Firecrawl, concurrency: int, records: list[dict]
) -> None:
    # Several records (synonyms) can share a page: scrape each page only once.
    records_by_page: dict[Page, list[dict]] = {}
    pending: list[dict] = []
    for record in records:
        page = _source_page(record)
        if page is None:
            pending.append(merge_edibility(merge_taxonomy(record, {}), None) | NO_PAGE_DATA)
        else:
            records_by_page.setdefault(page, []).append(record)

    saved = 0
    failed: list[str] = []

    def flush() -> None:
        nonlocal saved
        if pending:
            with conn.cursor() as cur:
                cur.executemany(INSERT_SQL, pending)
            conn.commit()
            saved += len(pending)
            pending.clear()

    flush()  # the records without a page
    pool = ThreadPoolExecutor(max_workers=concurrency)
    try:
        with Progress(
            TextColumn("Scraping Wikipedia"),
            BarColumn(),
            MofNCompleteColumn(),
            console=console,
        ) as progress:
            task = progress.add_task("scrape", total=len(records_by_page))
            futures: dict[Future[str], Page] = {
                pool.submit(
                    firecrawl.scrape_html, page.url, [INFOBOX_SELECTOR, LEAD_SELECTOR]
                ): page
                for page in records_by_page
            }
            for future in as_completed(futures):
                page = futures[future]
                progress.advance(task)
                try:
                    html = future.result()
                except FirecrawlFatalError:
                    raise
                except FirecrawlError as e:
                    failed.append(str(e))
                    continue
                data = parse_infobox(html, page.lang)
                wikipedia_edibility = data.pop("wikipedia_edibility")
                wikipedia_taxonomy = data.pop("wikipedia_taxonomy")
                for record in records_by_page[page]:
                    names = parse_common_names(html, page.lang, record["genus"], record["species"])
                    merged = merge_taxonomy(record, wikipedia_taxonomy)
                    pending.append(merge_edibility(merged, wikipedia_edibility) | data | names)
                if len(pending) >= COMMIT_EVERY:
                    flush()
    except FirecrawlFatalError as e:
        console.print(f"[red]Firecrawl error, stopping:[/red] {e}")
    except KeyboardInterrupt:
        console.print("[yellow]Interrupted.[/yellow]")
    finally:
        pool.shutdown(wait=False, cancel_futures=True)
        flush()

    console.print(f"[green]Saved {saved} mushrooms into '{TABLE}'.[/green]")
    if failed:
        console.print(
            f"[yellow]{len(failed)} pages could not be scraped "
            "(run the stage again to retry them):[/yellow]"
        )
        for message in failed[:10]:
            console.print(f"  {message}")


def parse_infobox(html: str, lang: str) -> dict:
    """Extract the mushrooms properties from the infobox HTML of a Wikipedia page."""
    taxonomy_header, morphology_header, status_header = INFOBOX_HEADERS[lang]
    tables = BeautifulSoup(html, "html.parser").select(INFOBOX_SELECTOR)

    data = {key: "" for key in PROPERTIES}
    data["wikipedia_edibility"] = None
    morphology = _find_table(tables, morphology_header)
    if morphology is not None:
        rows = _parse_it_morphology(morphology) if lang == "it" else _parse_en_morphology(morphology)
        data["wikipedia_edibility"] = edibility_level(", ".join(rows.pop("edibility", [])))
        for key, values in rows.items():
            data[key] = ", ".join(values)

    taxonomy = _find_table(tables, taxonomy_header)
    data["wikipedia_taxonomy"] = _parse_taxobox(taxonomy, lang) if taxonomy is not None else {}
    data["conservation_status"] = _conservation_status(tables, status_header)
    # Prefer the taxobox picture; fall back to any other infobox image, but not to
    # the icons of the morphology box.
    candidates = [taxonomy, *tables] if taxonomy is not None else tables
    if morphology is not None and morphology is not taxonomy:
        candidates = [table for table in candidates if table is not morphology]
    data["cover_image"] = next(
        (image for table in candidates if (image := _cover_image(table))), ""
    )
    return data


def _parse_taxobox(table: Tag, lang: str) -> dict[str, str]:
    """The ranks of the "Scientific classification" box, keyed by column; the ranks
    it does not give are missing."""
    labels = TAXOBOX_LABELS[lang]
    taxonomy: dict[str, str] = {}
    for tr in table.find_all("tr"):
        # A rank is a label and a value, e.g. "Divisione | Basidiomycota".
        cells = tr.find_all(["th", "td"])
        if len(cells) != 2:
            continue
        column = labels.get(_text(cells[0]).rstrip(":"))
        name = TAXON_NAME.match(_text(cells[1]))
        # "Incertae sedis": the rank is not known.
        if column and name and name.group() != "Incertae":
            taxonomy.setdefault(column, name.group())
    return taxonomy


def edibility_level(value: str) -> int | None:
    """The edibility level of a Wikipedia edibility value, None when unknown."""
    value = value.lower()
    for level, keywords in EDIBILITY_KEYWORDS:
        if any(keyword in value for keyword in keywords):
            return level
    return None


def merge_edibility(record: dict, wikipedia_level: int | None) -> dict:
    """`record` with `edible` and `poisonous` set to the more dangerous level between
    funghiitaliani.it and Wikipedia."""
    if record["poisonous"]:
        level = POISONOUS
    else:
        level = EDIBLE if record["edible"] else INEDIBLE
    if wikipedia_level is not None:
        level = max(level, wikipedia_level)
    return record | {"edible": level == EDIBLE, "poisonous": level == POISONOUS}


def parse_common_names(html: str, lang: str, genus: str, species: str) -> dict:
    """The common names of the mushroom on a Wikipedia page, keyed by column.

    Italian pages list them in the taxobox, under "Nomi comuni". Otherwise they are
    the bold terms of the lead that are not in italics, which is how the scientific
    name and its synonyms are written ("Agaricus campestris is ... commonly known
    as the field mushroom").
    """
    soup = BeautifulSoup(html, "html.parser")
    names = _it_common_names(soup.select(INFOBOX_SELECTOR)) if lang == "it" else []
    if not names:
        names = _lead_common_names(soup, genus, species)
    return {
        "common_name_it": ", ".join(names) if lang == "it" else "",
        "common_name_en": ", ".join(names) if lang == "en" else "",
    }


def _it_common_names(tables: list[Tag]) -> list[str]:
    for table in tables:
        for tr in table.find_all("tr"):
            if _text(tr) != IT_COMMON_NAMES_HEADER:
                continue
            row = tr.find_next_sibling("tr")
            if row is None:
                return []
            # Names come in list items, paragraphs or lines, several separated by
            # commas; those in other languages start with the language code,
            # e.g. "(EN) Ruby Bolete".
            for citation in row.select("sup.reference"):
                citation.decompose()
            for br in row.find_all("br"):
                br.replace_with("\n")
            for item in row.find_all(["li", "p"]):
                item.append("\n")
            lines = row.get_text().split("\n")
            return _unique(
                name
                for line in lines
                if not FOREIGN_NAMES.match(line)
                for name in line.split(",")
            )
    return []


def _lead_common_names(soup: BeautifulSoup, genus: str, species: str) -> list[str]:
    scientific = {genus.lower(), species.lower()}
    names = []
    for p in soup.find_all("p"):
        if p.find_parent("table") is not None:
            continue
        for b in p.find_all("b"):
            if b.find_parent("i") is not None or b.find("i") is not None:
                continue
            name = _text(b)
            if not scientific.isdisjoint(re.findall(r"\w+", name.lower())):
                continue  # a scientific name not written in italics
            names.append(name)
    return _unique(names)


def _unique(names) -> list[str]:
    """Non-empty names with whitespace collapsed, without case-insensitive repeats."""
    unique: dict[str, str] = {}
    for name in names:
        name = " ".join(name.split()).strip(" .;:")
        if name:
            unique.setdefault(name.casefold(), name)
    return list(unique.values())


def _find_table(tables: list[Tag], header: str) -> Tag | None:
    return next((table for table in tables if table.find(string=header)), None)


def _parse_it_morphology(table: Tag) -> dict[str, list[str]]:
    rows: dict[str, list[str]] = {}
    for tr in table.find_all("tr"):
        th, td = tr.find("th"), tr.find("td")
        if th is None or td is None:
            continue
        label = _text(th)
        key = "edibility" if label == IT_EDIBILITY_LABEL else IT_LABELS.get(label)
        value = _text(td)
        if key and value:
            rows.setdefault(key, []).append(value)
    return rows


def _parse_en_morphology(table: Tag) -> dict[str, list[str]]:
    # Each row is an icon plus a sentence, e.g. "Cap is convex".
    rows: dict[str, list[str]] = {}
    for tr in table.find_all("tr"):
        cells = tr.find_all(["th", "td"])
        if len(cells) < 2:
            continue
        parsed = _parse_en_sentence(_text(cells[-1]))
        if parsed:
            key, value = parsed
            rows.setdefault(key, []).append(value)
    return rows


def _parse_en_sentence(sentence: str) -> tuple[str, str] | None:
    lower = sentence.lower()
    if lower.startswith("edibility"):
        # "Edibility is edible but not recommended"
        return "edibility", re.sub(r"^edibility\s+is\s+", "", lower)
    if lower.startswith("hymenium"):
        # "Hymenium is adnate" describes how the gills attach: that's lamella.
        key = "lamella"
    elif lower.endswith("hymenium"):
        # "Gills on hymenium", "Smooth hymenium"
        return "hymenium", re.sub(r"\s*(on\s+)?hymenium$", "", lower)
    elif "spore print" in lower:
        key = "spore_print"
    elif "stipe" in lower:
        key = "stipe"
    elif "cap" in lower:
        key = "cap"
    elif lower.startswith("ecology"):
        key = "ecology"
    else:
        return None  # an unknown row
    # "Cap is convex" -> "convex"; "Lacks a stipe" stays as it is.
    value = re.sub(r"^(hymenium( attachment)?|spore print|stipe|cap|ecology)\s+is\s+", "", lower)
    return key, value


def _conservation_status(tables: list[Tag], header: str) -> str:
    # The status is in the row after the one holding the header.
    for table in tables:
        for tr in table.find_all("tr"):
            if _text(tr) == header:
                status = tr.find_next_sibling("tr")
                return _text(status) if status is not None else ""
    return ""


def _cover_image(table: Tag) -> str:
    for link in table.select("a.mw-file-description"):
        img = link.find("img")
        # Skip conservation status charts (e.g. File:Status_iucn3.1_LC.svg).
        if img is None or "/File:Status_" in link.get("href", ""):
            continue
        url = _image_url(img.get("src", ""), img.get("data-file-width", ""))
        if url not in COVER_BLACKLIST:
            return url
    return ""


def _image_url(src: str, file_width: str) -> str:
    """Turn an infobox thumbnail (~250px) into a COVER_WIDTH one, or the original
    file when that is smaller."""
    src = src.split("?")[0]  # drop the utm_* tracking params
    if src.startswith("//"):
        src = f"https:{src}"
    # e.g. https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ef/X.jpg/250px-X.jpg
    match = THUMB_URL.match(src)
    if match is None:
        return src
    base, path, name = match.groups()
    if file_width.isdigit() and int(file_width) <= COVER_WIDTH:
        return f"{UPLOAD_HOST}{base}/{path}"
    return f"{UPLOAD_HOST}{base}/thumb/{path}/{COVER_WIDTH}px-{name}"


def _text(tag: Tag) -> str:
    """Visible text of `tag` with whitespace collapsed and citations removed."""
    for citation in tag.select("sup.reference"):
        citation.decompose()
    for br in tag.find_all("br"):
        br.replace_with(" ")
    return " ".join(tag.get_text().split())
