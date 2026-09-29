"""Stage 6: export the `mushrooms` table to a JSON file.

The output follows the structure of data/8.json: a list of objects with the
row id, a `taxonomy` and a `properties` object, keys in camelCase. The source
ids (funghi_italiani and Wikipedia) and the timestamps are not exported.
"""

import json
from pathlib import Path

import psycopg
import questionary
from psycopg.rows import dict_row
from rich.console import Console

from scraper.config import PROJECT_ROOT, ConfigError, load_db_config
from scraper.db import connect, row_count, table_exists

TABLE = "mushrooms"
DEFAULT_PATH = "data/mushrooms.json"

QUERY = f"""
SELECT
    id, kingdom, division, taxon_class, taxon_order, family, genus, species,
    edible, microscopic, cap, hymenium, lamella, stipe, gleba, spore_print,
    ecology, conservation_status, cover_image
FROM {TABLE}
ORDER BY genus, species, id
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
            if not table_exists(conn, TABLE) or not row_count(conn, TABLE):
                console.print(f"[red]Table '{TABLE}' is missing or empty. Run stage 4 first.[/red]")
                return
            with conn.cursor(row_factory=dict_row) as cur:
                rows = cur.execute(QUERY).fetchall()
    except psycopg.OperationalError as e:
        console.print(f"[red]Could not connect to the database:[/red] {e}")
        return

    answer = questionary.text(
        "Output file (relative to the scraper folder):", default=DEFAULT_PATH
    ).ask()
    if not answer:
        console.print("Cancelled.")
        return
    path = PROJECT_ROOT / answer
    if path.exists() and not questionary.confirm(
        f"{path} already exists. Overwrite it?", default=True
    ).ask():
        console.print("Cancelled.")
        return

    write_json(path, [to_json(row) for row in rows])
    console.print(f"[green]Exported {len(rows)} mushrooms to {path}.[/green]")


def to_json(row: dict) -> dict:
    return {
        "id": row["id"],
        "taxonomy": {
            "kingdom": row["kingdom"],
            "division": row["division"],
            "class": row["taxon_class"],
            "order": row["taxon_order"],
            "family": row["family"],
            "genus": row["genus"],
            "species": row["species"],
        },
        "properties": {
            "edible": row["edible"],
            "microscopic": row["microscopic"],
            "cap": row["cap"],
            "hymenium": row["hymenium"],
            "lamella": row["lamella"],
            "stipe": row["stipe"],
            "gleba": row["gleba"],
            "sporePrint": row["spore_print"],
            "ecology": row["ecology"],
            "conservationStatus": row["conservation_status"],
            "coverImage": row["cover_image"],
        },
    }


def write_json(path: Path, data: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # Write to a temporary file first, so a failure never leaves a truncated export.
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)
