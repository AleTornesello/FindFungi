"""Stage 6: download the photos of every funghiitaliani.it detail page (the forum
topic linked from the grid) into `funghi_italiani_photos`.

Every page of a topic is read and the images posted in it are kept in page order:
avatars, badges, emoticons and quoted posts are skipped, and a linked full size
image is preferred to its thumbnail. Only the image URLs are stored. Each topic is
saved with its photos in `funghi_italiani_topics`, and saves are committed in
small batches, so an interrupted run can be resumed.
"""

import re
import time
from concurrent.futures import Future, ThreadPoolExecutor, as_completed
from urllib.parse import urljoin, urlparse

import httpx
import psycopg
import questionary
from bs4 import BeautifulSoup, Tag
from rich.console import Console
from rich.progress import BarColumn, MofNCompleteColumn, Progress, TextColumn

from scraper.config import ConfigError, load_db_config
from scraper.db import connect, row_count, table_exists

SITE_URL = "https://www.funghiitaliani.it/"
TOPIC_URL = SITE_URL + "index.php?showtopic={topic_id}"
USER_AGENT = "FindFungi-scraper/0.1 (https://github.com/AleTornesello/FindFungi)"
CONCURRENCY = 4  # keep it low: it is a community forum, not an API
MAX_ATTEMPTS = 3
COMMIT_EVERY = 25

TOPICS_TABLE = "funghi_italiani_topics"
PHOTOS_TABLE = "funghi_italiani_photos"
REQUIRED_TABLES = ("funghi_italiani", TOPICS_TABLE, PHOTOS_TABLE)

# Posted photos live under /uploads/; emoticons do too, under /uploads/emoticons/.
PHOTO_PATH = re.compile(r"^/uploads/(?!emoticons/).+\.(jpe?g|png|webp)$", re.IGNORECASE)
# Old posts link images through a placeholder instead of the site URL.
BASE_URL_PLACEHOLDER = re.compile(r"^(%7B|\{)___base_url___(%7D|\})/?", re.IGNORECASE)
# Thumbnail of the old forum (e.g. post-2286-1191440772_thumb.jpg): the full size
# image has the same name without "_thumb".
LEGACY_THUMB = re.compile(r"_thumb(\.\w+)$")
# Restricted (403) and deleted (404, 410) topics.
UNAVAILABLE_STATUSES = {403, 404, 410}

MISSING = "Download only topics not fetched yet"
ALL = "Download all topics again"
CANCEL = "Cancel"

TOPIC_SQL = f"""
INSERT INTO {TOPICS_TABLE} (topic_id, url, pages)
VALUES (%(topic_id)s, %(url)s, %(pages)s)
ON CONFLICT (topic_id) DO UPDATE SET
    url = EXCLUDED.url,
    pages = EXCLUDED.pages,
    fetched_at = now()
"""

PHOTO_SQL = f"""
INSERT INTO {PHOTOS_TABLE} (topic_id, position, post_id, url, thumbnail_url)
VALUES (%(topic_id)s, %(position)s, %(post_id)s, %(url)s, %(thumbnail_url)s)
"""

console = Console()


class TopicError(Exception):
    """A topic could not be downloaded; other topics may still succeed."""


def run() -> None:
    try:
        config = load_db_config()
    except ConfigError as e:
        console.print(f"[red]{e}[/red]")
        return

    console.print(f"Connecting to [cyan]{config.display}[/cyan]...")
    try:
        with connect(config) as conn:
            for table in REQUIRED_TABLES:
                if not table_exists(conn, table):
                    console.print(
                        f"[red]Table '{table}' does not exist. Run stage 1 first.[/red]"
                    )
                    return

            only_missing = False
            count = row_count(conn, TOPICS_TABLE)
            if count:
                console.print(
                    f"[yellow]Table '{TOPICS_TABLE}' already has {count} topics.[/yellow]"
                )
                mode = questionary.select(
                    "Which topics should be downloaded?",
                    choices=[MISSING, ALL, CANCEL],
                    default=MISSING,
                ).ask()
                if mode in (None, CANCEL):
                    console.print("Cancelled.")
                    return
                only_missing = mode == MISSING

            topic_ids = load_topic_ids(conn, only_missing)
            if not topic_ids:
                console.print("[green]Nothing to download.[/green]")
                return
            _download_and_save(conn, topic_ids)
    except psycopg.OperationalError as e:
        console.print(f"[red]Could not connect to the database:[/red] {e}")


def load_topic_ids(conn: psycopg.Connection, only_missing: bool) -> list[int]:
    query = "SELECT DISTINCT f.topic_id FROM funghi_italiani f WHERE f.topic_id IS NOT NULL"
    if only_missing:
        query += (
            f" AND NOT EXISTS (SELECT 1 FROM {TOPICS_TABLE} t WHERE t.topic_id = f.topic_id)"
        )
    query += " ORDER BY f.topic_id"
    return [row[0] for row in conn.execute(query).fetchall()]


def _download_and_save(conn: psycopg.Connection, topic_ids: list[int]) -> None:
    saved_topics = saved_photos = 0
    failed: list[str] = []
    pending: list[tuple[dict, list[dict]]] = []

    def flush() -> None:
        nonlocal saved_topics, saved_photos
        if not pending:
            return
        with conn.cursor() as cur:
            for topic, photos in pending:
                cur.execute(
                    f"DELETE FROM {PHOTOS_TABLE} WHERE topic_id = %s", (topic["topic_id"],)
                )
                cur.execute(TOPIC_SQL, topic)
                if photos:
                    cur.executemany(PHOTO_SQL, photos)
                saved_photos += len(photos)
        conn.commit()
        saved_topics += len(pending)
        pending.clear()

    client = httpx.Client(
        headers={"User-Agent": USER_AGENT}, timeout=30, follow_redirects=True
    )
    pool = ThreadPoolExecutor(max_workers=CONCURRENCY)
    try:
        with Progress(
            TextColumn("Downloading topics"),
            BarColumn(),
            MofNCompleteColumn(),
            console=console,
        ) as progress:
            task = progress.add_task("download", total=len(topic_ids))
            futures: dict[Future[tuple[dict, list[dict]]], int] = {
                pool.submit(fetch_topic, client, topic_id): topic_id for topic_id in topic_ids
            }
            for future in as_completed(futures):
                progress.advance(task)
                try:
                    pending.append(future.result())
                except TopicError as e:
                    failed.append(str(e))
                    continue
                if len(pending) >= COMMIT_EVERY:
                    flush()
    except KeyboardInterrupt:
        console.print("[yellow]Interrupted.[/yellow]")
    finally:
        pool.shutdown(wait=False, cancel_futures=True)
        flush()
        client.close()

    console.print(
        f"[green]Saved {saved_topics} topics with {saved_photos} photos "
        f"into '{TOPICS_TABLE}' and '{PHOTOS_TABLE}'.[/green]"
    )
    if failed:
        console.print(
            f"[yellow]{len(failed)} topics could not be downloaded "
            "(run the stage again to retry them):[/yellow]"
        )
        for message in failed[:10]:
            console.print(f"  {message}")


def fetch_topic(client: httpx.Client, topic_id: int) -> tuple[dict, list[dict]]:
    """Download every page of a topic; return its row and its photo rows."""
    response = _get(client, TOPIC_URL.format(topic_id=topic_id))
    if response is None:
        return {"topic_id": topic_id, "url": None, "pages": 0}, []

    url = str(response.url)
    soup = BeautifulSoup(response.text, "html.parser")
    pages = page_count(soup)
    photos = parse_photos(soup)
    for page in range(2, pages + 1):
        # The canonical topic URL ends with a slash, e.g. .../topic/24260-abortiporus-biennis/
        page_response = _get(client, f"{url}page/{page}/")
        if page_response is None:
            raise TopicError(f"Topic {topic_id}: page {page} not available")
        photos += parse_photos(BeautifulSoup(page_response.text, "html.parser"))

    rows: list[dict] = []
    seen: set[str] = set()
    for photo in photos:
        if photo["url"] in seen:  # the same photo posted again
            continue
        seen.add(photo["url"])
        rows.append(photo | {"topic_id": topic_id, "position": len(rows) + 1})
    return {"topic_id": topic_id, "url": url, "pages": pages}, rows


def _get(client: httpx.Client, url: str) -> httpx.Response | None:
    """GET `url` with retries; None when the page is not available."""
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            response = client.get(url)
        except httpx.TransportError as e:
            if attempt == MAX_ATTEMPTS:
                raise TopicError(f"{url}: {e}") from e
            time.sleep(2**attempt)
            continue
        if response.status_code in UNAVAILABLE_STATUSES:
            return None
        if response.status_code == 429 or response.status_code >= 500:
            if attempt == MAX_ATTEMPTS:
                raise TopicError(f"{url}: HTTP {response.status_code}")
            time.sleep(2**attempt)
            continue
        if response.is_error:
            raise TopicError(f"{url}: HTTP {response.status_code}")
        return response
    raise AssertionError("unreachable")


def page_count(soup: BeautifulSoup) -> int:
    pagination = soup.select_one("[data-pages]")
    value = pagination.get("data-pages", "") if pagination else ""
    return int(value) if isinstance(value, str) and value.isdigit() else 1


def parse_photos(soup: BeautifulSoup) -> list[dict]:
    """Photos posted on a topic page, in order, as {post_id, url, thumbnail_url}."""
    photos: list[dict] = []
    for article in soup.select("article[id^='elComment_']"):
        content = article.select_one("[data-role='commentContent']")
        post_id = article["id"].removeprefix("elComment_")
        if content is None or not post_id.isdigit():
            continue
        for quote in content.select("blockquote"):
            quote.decompose()  # quoted photos belong to another post
        for img in content.find_all("img"):
            photo = _photo(img)
            if photo:
                photos.append(photo | {"post_id": int(post_id)})
    return photos


def _photo(img: Tag) -> dict | None:
    # Lazy loaded images keep the real address in data-src.
    src = _photo_url(img.get("data-src") or img.get("src"))
    if src is None:
        return None
    # The full size image is linked from the thumbnail (an <a>, or in old posts
    # a <span> with an href).
    link = img.find_parent(href=True)
    full = _photo_url(link.get("href")) if link is not None else None
    if full is None and LEGACY_THUMB.search(src):
        full = LEGACY_THUMB.sub(r"\1", src)
    if full is None or full == src:
        return {"url": src, "thumbnail_url": ""}
    return {"url": full, "thumbnail_url": src}


def _photo_url(value: object) -> str | None:
    """Absolute URL of an uploaded photo, or None for anything else."""
    if not isinstance(value, str) or not value:
        return None
    url = urljoin(SITE_URL, BASE_URL_PLACEHOLDER.sub(SITE_URL, value.strip()))
    parsed = urlparse(url)
    if not parsed.netloc.endswith("funghiitaliani.it") or not PHOTO_PATH.match(parsed.path):
        return None
    return parsed._replace(scheme="https", query="", fragment="").geturl()
