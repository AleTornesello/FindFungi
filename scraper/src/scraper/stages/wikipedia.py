"""Stage 4: for every record in `funghi_italiani`, look up a "<genus> <species>"
page on the Italian and English Wikipedia and store the result in
`wikipedia_pages`.

Titles are queried in batches of 50 (the API limit) and redirects are followed,
so synonyms resolve to the page of the accepted name. A redirect to a section of
another page (e.g. the genus page) does not count as a dedicated page. Results
are committed after every batch, so an interrupted run can be resumed.
"""

import time

import httpx
import psycopg
import questionary
from rich.console import Console
from rich.progress import BarColumn, MofNCompleteColumn, Progress, TextColumn

from scraper.config import ConfigError, load_db_config
from scraper.db import connect, row_count, table_exists

LANGS = ("it", "en")
API_URL = "https://{lang}.wikipedia.org/w/api.php"
USER_AGENT = "FindFungi-scraper/0.1 (https://github.com/AleTornesello/FindFungi)"
BATCH_SIZE = 50
MAX_ATTEMPTS = 3
TABLE = "wikipedia_pages"
SOURCE_TABLE = "funghi_italiani"

# Characters MediaWiki does not allow in titles; `|` would also split the batch.
INVALID_TITLE_CHARS = set("#<>[]{}|")

MISSING = "Search only mushrooms not searched yet"
ALL = "Search all mushrooms again"
CANCEL = "Cancel"

INSERT_SQL = f"""
INSERT INTO {TABLE} (funghi_italiani_id, lang, searched_title, page_id, page_title)
VALUES (%(funghi_italiani_id)s, %(lang)s, %(searched_title)s, %(page_id)s, %(page_title)s)
ON CONFLICT (funghi_italiani_id, lang) DO UPDATE SET
    searched_title = EXCLUDED.searched_title,
    page_id = EXCLUDED.page_id,
    page_title = EXCLUDED.page_title,
    searched_at = now()
"""

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
            for table in (SOURCE_TABLE, TABLE):
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
                    "Which mushrooms should be searched?",
                    choices=[MISSING, ALL, CANCEL],
                    default=MISSING,
                ).ask()
                if mode in (None, CANCEL):
                    console.print("Cancelled.")
                    return
                only_missing = mode == MISSING

            with httpx.Client(timeout=30, headers={"User-Agent": USER_AGENT}) as client:
                for lang in LANGS:
                    mushrooms = _load_mushrooms(conn, lang, only_missing)
                    if not mushrooms:
                        console.print(f"[green]{lang}: nothing to search.[/green]")
                        continue
                    try:
                        found = _search_and_save(conn, client, lang, mushrooms)
                    except httpx.HTTPError as e:
                        console.print(f"[red]{lang}: search failed:[/red] {e}")
                        return
                    console.print(
                        f"[green]{lang}: found {found} pages "
                        f"for {len(mushrooms)} mushrooms.[/green]"
                    )
    except psycopg.OperationalError as e:
        console.print(f"[red]Could not connect to the database:[/red] {e}")


def _load_mushrooms(
    conn: psycopg.Connection, lang: str, only_missing: bool
) -> list[tuple[int, str]]:
    """Return (funghi_italiani id, title to search) pairs."""
    query = f"""
        SELECT f.id, f.genus || ' ' || f.species
        FROM {SOURCE_TABLE} f
        WHERE f.species <> ''
    """
    if only_missing:
        query += f"""
            AND NOT EXISTS (
                SELECT 1 FROM {TABLE} w
                WHERE w.funghi_italiani_id = f.id AND w.lang = %(lang)s
            )
        """
    query += " ORDER BY f.id"
    rows = conn.execute(query, {"lang": lang}).fetchall()
    return [(id_, title) for id_, title in rows if _is_valid_title(title)]


def _is_valid_title(title: str) -> bool:
    return not INVALID_TITLE_CHARS.intersection(title)


def _search_and_save(
    conn: psycopg.Connection,
    client: httpx.Client,
    lang: str,
    mushrooms: list[tuple[int, str]],
) -> int:
    # Several records can share a name: search each title only once.
    titles = sorted({title for _, title in mushrooms})
    ids_by_title: dict[str, list[int]] = {}
    for id_, title in mushrooms:
        ids_by_title.setdefault(title, []).append(id_)

    found = 0
    with Progress(
        TextColumn(f"Searching {lang}.wikipedia.org"),
        BarColumn(),
        MofNCompleteColumn(),
        console=console,
    ) as progress:
        task = progress.add_task("search", total=len(titles))
        for start in range(0, len(titles), BATCH_SIZE):
            batch = titles[start : start + BATCH_SIZE]
            pages = search_titles(client, lang, batch)
            records = [
                {
                    "funghi_italiani_id": id_,
                    "lang": lang,
                    "searched_title": title,
                    "page_id": page[0] if page else None,
                    "page_title": page[1] if page else None,
                }
                for title, page in pages.items()
                for id_ in ids_by_title[title]
            ]
            with conn.cursor() as cur:
                cur.executemany(INSERT_SQL, records)
            # Plain commit: conn.transaction() would only open a savepoint here,
            # because the SELECT in _load_mushrooms already started a transaction.
            conn.commit()
            found += sum(1 for record in records if record["page_id"] is not None)
            progress.update(task, advance=len(batch))
    return found


def search_titles(
    client: httpx.Client, lang: str, titles: list[str]
) -> dict[str, tuple[int, str] | None]:
    """Map each title to the (page id, page title) of its Wikipedia page, or None."""
    data = _query(client, lang, titles)["query"]

    normalized = {item["from"]: item["to"] for item in data.get("normalized", [])}
    redirects = {item["from"]: item for item in data.get("redirects", [])}
    pages = {
        page["title"]: page
        for page in data.get("pages", [])
        if "pageid" in page and not page.get("missing") and not page.get("invalid")
    }

    result: dict[str, tuple[int, str] | None] = {}
    for title in titles:
        resolved = normalized.get(title, title)
        redirect = redirects.get(resolved)
        if redirect is not None:
            if redirect.get("tofragment"):
                result[title] = None  # points to a section, not a dedicated page
                continue
            resolved = redirect["to"]
        page = pages.get(resolved)
        result[title] = (page["pageid"], page["title"]) if page else None
    return result


def _query(client: httpx.Client, lang: str, titles: list[str]) -> dict:
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            response = client.get(
                API_URL.format(lang=lang),
                params={
                    "action": "query",
                    "format": "json",
                    "formatversion": 2,
                    "redirects": 1,
                    "titles": "|".join(titles),
                },
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError:
            if attempt == MAX_ATTEMPTS:
                raise
            time.sleep(2**attempt)
    raise AssertionError("unreachable")
