"""Stage 1: create the `mushrooms` table matching the structure of data/8.json.

Each JSON record has three nested objects (source, taxonomy, properties); they are
flattened into a single row. Wikipedia page ids are either ints or "" in the source
data, so they are nullable. `class` and `order` are SQL keywords, hence taxon_*.
"""

import psycopg
import questionary
from rich.console import Console

from scraper.config import ConfigError, load_db_config
from scraper.db import connect, row_count, table_exists

TABLE = "mushrooms"

CREATE_TABLE_SQL = f"""
CREATE TABLE {TABLE} (
    id                        integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- source
    funghi_italiani_id        integer NOT NULL UNIQUE,
    funghi_italiani_topic_id  integer,
    wikipedia_it_page_id      bigint,
    wikipedia_en_page_id      bigint,

    -- taxonomy
    kingdom                   text NOT NULL DEFAULT '',
    division                  text NOT NULL DEFAULT '',
    taxon_class               text NOT NULL DEFAULT '',
    taxon_order               text NOT NULL DEFAULT '',
    family                    text NOT NULL DEFAULT '',
    genus                     text NOT NULL,
    species                   text NOT NULL,

    -- properties
    edible                    boolean NOT NULL DEFAULT false,
    microscopic               boolean NOT NULL DEFAULT false,
    cap                       text NOT NULL DEFAULT '',
    hymenium                  text NOT NULL DEFAULT '',
    lamella                   text NOT NULL DEFAULT '',
    stipe                     text NOT NULL DEFAULT '',
    gleba                     text NOT NULL DEFAULT '',
    spore_print               text NOT NULL DEFAULT '',
    ecology                   text NOT NULL DEFAULT '',
    conservation_status       text NOT NULL DEFAULT '',
    cover_image               text NOT NULL DEFAULT '',

    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX {TABLE}_genus_species_idx ON {TABLE} (genus, species);
"""

CLEAN = "Clean it (delete all rows, keep the table)"
RECREATE = "Recreate it (drop and create the table again)"
KEEP = "Leave it as it is"

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
            _setup(conn)
    except psycopg.OperationalError as e:
        console.print(f"[red]Could not connect to the database:[/red] {e}")


def _setup(conn: psycopg.Connection) -> None:
    if not table_exists(conn, TABLE):
        conn.execute(CREATE_TABLE_SQL)
        conn.commit()
        console.print(f"[green]Table '{TABLE}' created.[/green]")
        return

    count = row_count(conn, TABLE)
    console.print(f"[yellow]Table '{TABLE}' already exists ({count} rows).[/yellow]")
    choice = questionary.select(
        "What do you want to do?", choices=[CLEAN, RECREATE, KEEP], default=CLEAN
    ).ask()

    if choice == CLEAN:
        conn.execute(f"TRUNCATE {TABLE} RESTART IDENTITY")
        conn.commit()
        console.print(f"[green]Table '{TABLE}' cleaned.[/green]")
    elif choice == RECREATE:
        if not questionary.confirm(
            f"This drops '{TABLE}' and its {count} rows. Continue?", default=False
        ).ask():
            console.print("Aborted.")
            return
        conn.execute(f"DROP TABLE {TABLE}")
        conn.execute(CREATE_TABLE_SQL)
        conn.commit()
        console.print(f"[green]Table '{TABLE}' recreated.[/green]")
    else:
        console.print("Table left untouched.")
