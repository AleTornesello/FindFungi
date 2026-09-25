"""Stage 1: create the tables defined in scraper.schema.

If some tables already exist, ask whether to clean them, recreate them or leave
them as they are. Missing tables are always created.
"""

import psycopg
import questionary
from psycopg import sql
from rich.console import Console

from scraper.config import ConfigError, load_db_config
from scraper.db import connect, row_count, table_exists
from scraper.schema import TABLES

CLEAN = "Clean them (delete all rows, keep the tables)"
RECREATE = "Recreate them (drop and create the tables again)"
KEEP = "Leave them as they are"

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
    existing = [table for table in TABLES if table_exists(conn, table)]
    missing = [table for table in TABLES if table not in existing]

    for table in missing:
        conn.execute(TABLES[table])
        console.print(f"[green]Table '{table}' created.[/green]")
    conn.commit()

    if not existing:
        return

    for table in existing:
        count = row_count(conn, table)
        console.print(f"[yellow]Table '{table}' already exists ({count} rows).[/yellow]")
    choice = questionary.select(
        "What do you want to do with the existing tables?",
        choices=[CLEAN, RECREATE, KEEP],
        default=CLEAN,
    ).ask()

    if choice == CLEAN:
        conn.execute(
            sql.SQL("TRUNCATE {} RESTART IDENTITY").format(
                sql.SQL(", ").join(map(sql.Identifier, existing))
            )
        )
        conn.commit()
        console.print(f"[green]Cleaned: {', '.join(existing)}.[/green]")
    elif choice == RECREATE:
        if not questionary.confirm(
            f"This drops {', '.join(existing)} and all their rows. Continue?",
            default=False,
        ).ask():
            console.print("Aborted.")
            return
        for table in existing:
            conn.execute(sql.SQL("DROP TABLE {}").format(sql.Identifier(table)))
            conn.execute(TABLES[table])
        conn.commit()
        console.print(f"[green]Recreated: {', '.join(existing)}.[/green]")
    else:
        console.print("Existing tables left untouched.")
