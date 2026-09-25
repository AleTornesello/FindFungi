"""Stage 2: download every record from the funghiitaliani.it grid API and store it
in the `funghi_italiani` table.

All pages are fetched before touching the database, and the write happens in a
single transaction, so a failed run never leaves the table half-updated.
"""

import html
import time
from datetime import date, datetime

import httpx
import psycopg
import questionary
from rich.console import Console
from rich.progress import BarColumn, MofNCompleteColumn, Progress, TextColumn

from scraper.config import ConfigError, load_db_config
from scraper.db import connect, row_count, table_exists

API_URL = "https://funghi.funghiitaliani.it/get-data-for-grid.php"
PAGE_SIZE = 100
MAX_ATTEMPTS = 3
TABLE = "funghi_italiani"

REPLACE = "Replace (delete all rows, then insert)"
UPSERT = "Update (insert new rows, update existing ones)"
CANCEL = "Cancel"

INSERT_SQL = f"""
INSERT INTO {TABLE} (
    id, card_type, topic_id, genus, species, author, edibility, microscopic,
    kingdom, division, taxon_class, taxon_order, family,
    toxicity, toxicity_topic_id, inserted_on
) VALUES (
    %(id)s, %(card_type)s, %(topic_id)s, %(genus)s, %(species)s, %(author)s,
    %(edibility)s, %(microscopic)s, %(kingdom)s, %(division)s, %(taxon_class)s,
    %(taxon_order)s, %(family)s, %(toxicity)s, %(toxicity_topic_id)s, %(inserted_on)s
)
ON CONFLICT (id) DO UPDATE SET
    card_type = EXCLUDED.card_type,
    topic_id = EXCLUDED.topic_id,
    genus = EXCLUDED.genus,
    species = EXCLUDED.species,
    author = EXCLUDED.author,
    edibility = EXCLUDED.edibility,
    microscopic = EXCLUDED.microscopic,
    kingdom = EXCLUDED.kingdom,
    division = EXCLUDED.division,
    taxon_class = EXCLUDED.taxon_class,
    taxon_order = EXCLUDED.taxon_order,
    family = EXCLUDED.family,
    toxicity = EXCLUDED.toxicity,
    toxicity_topic_id = EXCLUDED.toxicity_topic_id,
    inserted_on = EXCLUDED.inserted_on,
    fetched_at = now()
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
            if not table_exists(conn, TABLE):
                console.print(
                    f"[red]Table '{TABLE}' does not exist. Run stage 1 first.[/red]"
                )
                return

            mode = UPSERT
            count = row_count(conn, TABLE)
            if count:
                console.print(f"[yellow]Table '{TABLE}' already has {count} rows.[/yellow]")
                mode = questionary.select(
                    "How should the downloaded data be saved?",
                    choices=[REPLACE, UPSERT, CANCEL],
                    default=REPLACE,
                ).ask()
                if mode in (None, CANCEL):
                    console.print("Cancelled.")
                    return

            try:
                raw_rows = fetch_all()
            except httpx.HTTPError as e:
                console.print(f"[red]Download failed:[/red] {e}")
                return

            records = [parse_row(row) for row in raw_rows]
            save(conn, records, replace=mode == REPLACE)
    except psycopg.OperationalError as e:
        console.print(f"[red]Could not connect to the database:[/red] {e}")


def fetch_all() -> list[dict]:
    rows: list[dict] = []
    with (
        httpx.Client(timeout=30) as client,
        Progress(
            TextColumn("Downloading"), BarColumn(), MofNCompleteColumn(), console=console
        ) as progress,
    ):
        task = progress.add_task("download", total=None)
        total = None
        while total is None or len(rows) < total:
            data = _fetch_page(client, start=len(rows))
            total = int(data["totalCount"])
            progress.update(task, total=total)
            if not data["rows"]:
                break  # the API reported more rows than it returned
            rows.extend(data["rows"])
            progress.update(task, completed=len(rows))

    if total is not None and len(rows) != total:
        console.print(f"[yellow]API reported {total} rows but returned {len(rows)}.[/yellow]")
    return rows


def _fetch_page(client: httpx.Client, start: int) -> dict:
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            response = client.post(
                API_URL,
                data={
                    "start": start,
                    "limit": PAGE_SIZE,
                    "sort": "genere,specie",
                    "dir": "ASC",
                },
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError:
            if attempt == MAX_ATTEMPTS:
                raise
            time.sleep(2**attempt)
    raise AssertionError("unreachable")


def parse_row(row: dict) -> dict:
    # Text fields contain HTML entities (e.g. "Pil&aacute;t", "&amp;").
    text = {key: html.unescape(value).strip() for key, value in row.items()}
    return {
        "id": int(text["id"]),
        "card_type": text["scheda"],
        "topic_id": _to_int(text["topic"]),
        "genus": text["genere"],
        "species": text["specie"],
        "author": text["autore"],
        "edibility": text["comme"],
        "microscopic": {"1": True, "0": False}.get(text["micro"]),
        "kingdom": text["regno"],
        "division": text["divisione"],
        "taxon_class": text["classe"],
        "taxon_order": text["ordine"],
        "family": text["famiglia"],
        "toxicity": text["tossi"],
        "toxicity_topic_id": _to_int(text["posttossi"]),
        "inserted_on": _to_date(text["datains"]),
    }


def _to_int(value: str) -> int | None:
    # Some source rows hold garbage here (e.g. the author name in `topic`).
    return int(value) if value.isdigit() else None


def _to_date(value: str) -> date | None:
    try:
        return datetime.strptime(value, "%Y%m%d").date()
    except ValueError:
        return None


def save(conn: psycopg.Connection, records: list[dict], replace: bool) -> None:
    with conn.transaction(), conn.cursor() as cur:
        if replace:
            cur.execute(f"TRUNCATE {TABLE}")
        cur.executemany(INSERT_SQL, records)
    console.print(f"[green]Saved {len(records)} records into '{TABLE}'.[/green]")
