"""Stage 7: export the `mushrooms` table to a JSON file.

The output is an object with two keys:

- `mushrooms`: the rows with the structure of data/8.json, i.e. the row id, a
  `taxonomy` and a `properties` object, keys in camelCase. The source ids
  (funghi_italiani and Wikipedia) and the timestamps are not exported.
  `properties.images` lists the Wikipedia cover image first, then the photos of
  the funghiitaliani.it topic (stage 6) in page order. `properties.commonNameIt`
  and `properties.commonNameEn` hold the common names from the Wikipedia page of
  that language, comma separated ('' when there are none).
- `translations`: per language and property, the translation of every English
  characteristic value in the export, from the dictionaries in
  `scraper.translations`.
"""

import json
from pathlib import Path

import psycopg
import questionary
from psycopg.rows import dict_row
from rich.console import Console
from rich.table import Table

from scraper.config import PROJECT_ROOT, ConfigError, load_db_config
from scraper.db import connect, row_count, table_exists
from scraper.translations import build_translations

TABLE = "mushrooms"
PHOTOS_TABLE = "funghi_italiani_photos"
DEFAULT_PATH = "data/mushrooms.json"

QUERY = f"""
SELECT
    id, kingdom, division, taxon_class, taxon_order, family, genus, species,
    common_name_it, common_name_en, edible, poisonous, toxicity_effect_it, microscopic, cap, hymenium, lamella, stipe, gleba, spore_print,
    ecology, conservation_status, cover_image,
    ARRAY(
        SELECT p.url FROM {PHOTOS_TABLE} p
        WHERE p.topic_id = m.funghi_italiani_topic_id
        ORDER BY p.position
    ) AS photos
FROM {TABLE} m
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
            if not table_exists(conn, PHOTOS_TABLE):
                console.print(
                    f"[red]Table '{PHOTOS_TABLE}' does not exist. Run stage 1 first.[/red]"
                )
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

    mushrooms = [to_json(row) for row in rows]
    translations, missing = build_translations(mushrooms)
    write_json(path, {"mushrooms": mushrooms, "translations": translations})
    console.print(f"[green]Exported {len(rows)} mushrooms to {path}.[/green]")
    if missing:
        console.print(
            f"[yellow]{len(missing)} values have no translation and will be shown in English "
            "(add them to src/scraper/translations.py):[/yellow]"
        )
        table = Table()
        table.add_column("Language")
        table.add_column("Property")
        table.add_column("Value")
        for language, field, value in sorted(missing):
            table.add_row(language, field, value)
        console.print(table)


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
            "commonNameIt": row["common_name_it"],
            "commonNameEn": row["common_name_en"],
            "edible": row["edible"],
            "poisonous": row["poisonous"],
            "toxicityEffectIt": row["toxicity_effect_it"],
            "microscopic": row["microscopic"],
            "cap": row["cap"],
            "hymenium": row["hymenium"],
            "lamella": row["lamella"],
            "stipe": row["stipe"],
            "gleba": row["gleba"],
            "sporePrint": row["spore_print"],
            "ecology": row["ecology"],
            "conservationStatus": row["conservation_status"],
            "images": images(row),
        },
    }


def images(row: dict) -> list[str]:
    """The Wikipedia cover image, then the funghiitaliani.it photos, without repeats."""
    urls = [row["cover_image"], *row["photos"]]
    return list(dict.fromkeys(url for url in urls if url))


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # Write to a temporary file first, so a failure never leaves a truncated export.
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)
