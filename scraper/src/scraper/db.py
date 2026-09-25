import psycopg
from psycopg import sql

from scraper.config import DbConfig


def connect(config: DbConfig) -> psycopg.Connection:
    return psycopg.connect(
        host=config.host,
        port=config.port,
        dbname=config.name,
        user=config.user,
        password=config.password,
        connect_timeout=5,
    )


def table_exists(conn: psycopg.Connection, table: str) -> bool:
    row = conn.execute("SELECT to_regclass(%s) IS NOT NULL", (table,)).fetchone()
    return bool(row and row[0])


def row_count(conn: psycopg.Connection, table: str) -> int:
    query = sql.SQL("SELECT count(*) FROM {}").format(sql.Identifier(table))
    row = conn.execute(query).fetchone()
    return row[0] if row else 0
