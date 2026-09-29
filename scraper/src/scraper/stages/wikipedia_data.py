"""Stage 4: fill the `mushrooms` table from the Wikipedia infoboxes.

Every `funghi_italiani` record with a Wikipedia page (see stage 3) becomes a row:
taxonomy and edibility come from funghi_italiani, the morphological properties,
conservation status and cover image from the Italian page, or from the English
one when there is no Italian page. Records without any page are skipped.

Pages are fetched through the Firecrawl API, which returns only the infobox
tables; each page is scraped once even if several records point to it. Rows are
committed in small batches, so an interrupted run can be resumed.
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
from scraper.db import connect, row_count, table_exists
from scraper.firecrawl import Firecrawl, FirecrawlError, FirecrawlFatalError

TABLE = "mushrooms"
REQUIRED_TABLES = ("funghi_italiani", "wikipedia_pages", TABLE)
PAGE_URL = "https://{lang}.wikipedia.org/?curid={page_id}"
INFOBOX_SELECTOR = "table.infobox"
COMMIT_EVERY = 25

COVER_WIDTH = 500
UPLOAD_HOST = "https://upload.wikimedia.org"
THUMB_URL = re.compile(r"^https://[^/]+(/wikipedia/[^/]+)/thumb/(.+)/\d+px-([^/]+)$")

# funghiitaliani.it edibility codes counted as edible (C: edible, C1: edible
# with caution); N, V, M and '' are not.
EDIBLE_CODES = {"C", "C1"}

PROPERTIES = ("cap", "hymenium", "lamella", "stipe", "gleba", "spore_print", "ecology")

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
    edible, microscopic, cap, hymenium, lamella, stipe, gleba, spore_print, ecology,
    conservation_status, cover_image
) VALUES (
    %(funghi_italiani_id)s, %(funghi_italiani_topic_id)s, %(wikipedia_it_page_id)s,
    %(wikipedia_en_page_id)s, %(kingdom)s, %(division)s, %(taxon_class)s, %(taxon_order)s,
    %(family)s, %(genus)s, %(species)s, %(edible)s, %(microscopic)s, %(cap)s, %(hymenium)s,
    %(lamella)s, %(stipe)s, %(gleba)s, %(spore_print)s, %(ecology)s,
    %(conservation_status)s, %(cover_image)s
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
    edible = EXCLUDED.edible,
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
    """funghi_italiani records with a Wikipedia page, as dicts keyed like INSERT_SQL."""
    query = f"""
        SELECT
            f.id AS funghi_italiani_id,
            f.topic_id AS funghi_italiani_topic_id,
            it.page_id AS wikipedia_it_page_id,
            en.page_id AS wikipedia_en_page_id,
            f.kingdom, f.division, f.taxon_class, f.taxon_order, f.family,
            f.genus, f.species, f.edibility, f.microscopic
        FROM funghi_italiani f
        LEFT JOIN wikipedia_pages it ON it.funghi_italiani_id = f.id AND it.lang = 'it'
        LEFT JOIN wikipedia_pages en ON en.funghi_italiani_id = f.id AND en.lang = 'en'
        WHERE (it.page_id IS NOT NULL OR en.page_id IS NOT NULL)
    """
    if only_missing:
        query += f" AND NOT EXISTS (SELECT 1 FROM {TABLE} m WHERE m.funghi_italiani_id = f.id)"
    query += " ORDER BY f.id"

    with conn.cursor(row_factory=dict_row) as cur:
        records = cur.execute(query).fetchall()
    for record in records:
        record["edible"] = record.pop("edibility") in EDIBLE_CODES
        record["microscopic"] = bool(record["microscopic"])
    return records


def _source_page(record: dict) -> Page:
    if record["wikipedia_it_page_id"] is not None:
        return Page("it", record["wikipedia_it_page_id"])
    return Page("en", record["wikipedia_en_page_id"])


def _scrape_and_save(
    conn: psycopg.Connection, firecrawl: Firecrawl, concurrency: int, records: list[dict]
) -> None:
    # Several records (synonyms) can share a page: scrape each page only once.
    records_by_page: dict[Page, list[dict]] = {}
    for record in records:
        records_by_page.setdefault(_source_page(record), []).append(record)

    saved = 0
    failed: list[str] = []
    pending: list[dict] = []

    def flush() -> None:
        nonlocal saved
        if pending:
            with conn.cursor() as cur:
                cur.executemany(INSERT_SQL, pending)
            conn.commit()
            saved += len(pending)
            pending.clear()

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
                pool.submit(firecrawl.scrape_html, page.url, [INFOBOX_SELECTOR]): page
                for page in records_by_page
            }
            for future in as_completed(futures):
                page = futures[future]
                progress.advance(task)
                try:
                    data = parse_infobox(future.result(), page.lang)
                except FirecrawlFatalError:
                    raise
                except FirecrawlError as e:
                    failed.append(str(e))
                    continue
                pending.extend(record | data for record in records_by_page[page])
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
    morphology = _find_table(tables, morphology_header)
    if morphology is not None:
        rows = _parse_it_morphology(morphology) if lang == "it" else _parse_en_morphology(morphology)
        for key, values in rows.items():
            data[key] = ", ".join(values)

    taxonomy = _find_table(tables, taxonomy_header)
    data["conservation_status"] = _conservation_status(tables, status_header)
    # Prefer the taxobox picture; fall back to any other infobox image.
    candidates = [taxonomy, *tables] if taxonomy is not None else tables
    data["cover_image"] = next(
        (image for table in candidates if (image := _cover_image(table))), ""
    )
    return data


def _find_table(tables: list[Tag], header: str) -> Tag | None:
    return next((table for table in tables if table.find(string=header)), None)


def _parse_it_morphology(table: Tag) -> dict[str, list[str]]:
    rows: dict[str, list[str]] = {}
    for tr in table.find_all("tr"):
        th, td = tr.find("th"), tr.find("td")
        if th is None or td is None:
            continue
        key = IT_LABELS.get(_text(th))
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
        return None  # edibility, or an unknown row
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
        return _image_url(img.get("src", ""), img.get("data-file-width", ""))
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
