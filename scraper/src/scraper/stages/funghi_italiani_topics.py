"""Stage 3: download every funghiitaliani.it detail page (the forum topic linked
from the grid) through the Firecrawl API, keeping the taxonomy of its species card
in `funghi_italiani_topics` and its photos in `funghi_italiani_photos`.

The first post of a topic is the species card, which starts with a "Tassonomia"
section: its division, class, order and family (and kingdom, when given) are saved
with the topic. Every page of a topic is read and the images posted in it are kept
in page order: avatars, badges, emoticons and quoted posts are skipped, and a linked
full size image is preferred to its thumbnail. Only the image URLs are stored, with
the Italian region named in the caption of the post (see scraper.regions). Saves are
committed in small batches, so an interrupted run can be resumed.
"""

import copy
import re
from concurrent.futures import Future, ThreadPoolExecutor, as_completed
from urllib.parse import urljoin, urlparse

import psycopg
import questionary
from bs4 import BeautifulSoup, NavigableString, Tag
from rich.console import Console
from rich.progress import BarColumn, MofNCompleteColumn, Progress, TextColumn

from scraper.config import ConfigError, load_db_config, load_firecrawl_config
from scraper.db import connect, migrate, row_count, table_exists
from scraper.firecrawl import (
    Firecrawl,
    FirecrawlError,
    FirecrawlFatalError,
    ScrapedPage,
)
from scraper.regions import caption_region

SITE_URL = "https://www.funghiitaliani.it/"
TOPIC_URL = SITE_URL + "index.php?showtopic={topic_id}"
# Upper bound on FIRECRAWL_CONCURRENCY: it is a community forum, not an API.
CONCURRENCY = 4
COMMIT_EVERY = 25
# Stop when this many topics fail in a row: Firecrawl is likely down (e.g. it keeps
# dropping connections or answering 5xx), and every further topic would fail slowly.
MAX_CONSECUTIVE_FAILURES = 10

TOPICS_TABLE = "funghi_italiani_topics"
PHOTOS_TABLE = "funghi_italiani_photos"
REQUIRED_TABLES = ("funghi_italiani", TOPICS_TABLE, PHOTOS_TABLE)

FIRST_POST_SELECTOR = "article[id^='elComment_'] [data-role='commentContent']"
# Posted photos live under /uploads/; emoticons do too, under /uploads/emoticons/.
PHOTO_PATH = re.compile(r"^/uploads/(?!emoticons/).+\.(jpe?g|png|webp)$", re.IGNORECASE)
# Old posts link images through a placeholder instead of the site URL.
BASE_URL_PLACEHOLDER = re.compile(r"^(%7B|\{)___base_url___(%7D|\})/?", re.IGNORECASE)
# Thumbnail of the old forum (e.g. post-2286-1191440772_thumb.jpg): the full size
# image has the same name without "_thumb".
LEGACY_THUMB = re.compile(r"_thumb(\.\w+)$")
# Elements that end a line of text.
BLOCK_TAGS = ["p", "div", "li", "td", "h1", "h2", "h3", "h4", "h5", "h6", "figcaption"]
# Restricted (403) and deleted (404, 410) topics.
UNAVAILABLE_STATUSES = {403, 404, 410}

# The "Tassonomia" section of the species card has a line per rank, the name
# sometimes followed by its author: "Divisione Basidiomycota", "Famiglia
# Tricholomataceae (Fayod) R. Heim ex Pouzar".
TAXONOMY_HEADER = "tassonomia"
TAXONOMY_RANKS = {
    "Regno": "kingdom",
    "Divisione": "division",
    "Classe": "taxon_class",
    "Ordine": "taxon_order",
    "Famiglia": "family",
}
# The other ranks of the section, skipped; any other line ends the section.
OTHER_RANKS = {
    "Sottodivisione",
    "Sottoclasse",
    "Sottordine",
    "Sottofamiglia",
    "Tribù",
    "Genere",
    "Sottogenere",
    "Sezione",
    "Sottosezione",
    "Subsezione",
    "Serie",
    "Stirpe",
    "Clade",
}
RANK_LINE = re.compile(r"^(\w+)\s*:?\s*(.*)$")
TAXON_NAME = re.compile(r"[A-Za-z]+")
# Italian names and misspellings found on the cards.
TAXON_FIXES = {
    "Funghi": "Fungi",
    "Agricomycetes": "Agaricomycetes",
    "Agaricomyctes": "Agaricomycetes",
    "Agaricicomycetes": "Agaricomycetes",
}

MISSING = "Download only topics not fetched yet"
ALL = "Download all topics again"
CANCEL = "Cancel"

TOPIC_SQL = f"""
INSERT INTO {TOPICS_TABLE} (
    topic_id, url, pages, kingdom, division, taxon_class, taxon_order, family
) VALUES (
    %(topic_id)s, %(url)s, %(pages)s, %(kingdom)s, %(division)s, %(taxon_class)s,
    %(taxon_order)s, %(family)s
)
ON CONFLICT (topic_id) DO UPDATE SET
    url = EXCLUDED.url,
    pages = EXCLUDED.pages,
    kingdom = EXCLUDED.kingdom,
    division = EXCLUDED.division,
    taxon_class = EXCLUDED.taxon_class,
    taxon_order = EXCLUDED.taxon_order,
    family = EXCLUDED.family,
    fetched_at = now()
"""

PHOTO_SQL = f"""
INSERT INTO {PHOTOS_TABLE} (topic_id, position, post_id, url, thumbnail_url, region)
VALUES (%(topic_id)s, %(position)s, %(post_id)s, %(url)s, %(thumbnail_url)s, %(region)s)
"""

console = Console()


class TopicError(Exception):
    """A topic could not be downloaded; other topics may still succeed."""


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

    console.print(f"Connecting to Firecrawl at [cyan]{firecrawl_config.api_url}[/cyan]...")
    firecrawl = Firecrawl(firecrawl_config)
    try:
        # Fail now rather than after the questions and a retry per topic.
        firecrawl.check_connection()
        console.print(f"Connecting to [cyan]{db_config.display}[/cyan]...")
        with connect(db_config) as conn:
            for table in REQUIRED_TABLES:
                if not table_exists(conn, table):
                    console.print(
                        f"[red]Table '{table}' does not exist. Run stage 1 first.[/red]"
                    )
                    return
            migrate(conn, TOPICS_TABLE)
            migrate(conn, PHOTOS_TABLE)
            conn.commit()

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

            concurrency = min(firecrawl_config.concurrency, CONCURRENCY)
            _download_and_save(conn, firecrawl, concurrency, topic_ids)
    except FirecrawlFatalError as e:
        console.print(f"[red]{e}[/red]")
    except psycopg.OperationalError as e:
        console.print(f"[red]Could not connect to the database:[/red] {e}")
    finally:
        firecrawl.close()


def load_topic_ids(conn: psycopg.Connection, only_missing: bool) -> list[int]:
    query = (
        "SELECT DISTINCT f.topic_id FROM funghi_italiani f WHERE f.topic_id IS NOT NULL"
    )
    if only_missing:
        query += f" AND NOT EXISTS (SELECT 1 FROM {TOPICS_TABLE} t WHERE t.topic_id = f.topic_id)"
    query += " ORDER BY f.topic_id"
    return [row[0] for row in conn.execute(query).fetchall()]


def _download_and_save(
    conn: psycopg.Connection,
    firecrawl: Firecrawl,
    concurrency: int,
    topic_ids: list[int],
) -> None:
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
                    f"DELETE FROM {PHOTOS_TABLE} WHERE topic_id = %s",
                    (topic["topic_id"],),
                )
                cur.execute(TOPIC_SQL, topic)
                if photos:
                    cur.executemany(PHOTO_SQL, photos)
                saved_photos += len(photos)
        conn.commit()
        saved_topics += len(pending)
        pending.clear()

    pool = ThreadPoolExecutor(max_workers=concurrency)
    try:
        with Progress(
            TextColumn("Downloading topics"),
            BarColumn(),
            MofNCompleteColumn(),
            console=console,
        ) as progress:
            task = progress.add_task("download", total=len(topic_ids))
            futures: dict[Future[tuple[dict, list[dict]]], int] = {
                pool.submit(fetch_topic, firecrawl, topic_id): topic_id
                for topic_id in topic_ids
            }
            consecutive_failures = 0
            for future in as_completed(futures):
                progress.advance(task)
                try:
                    pending.append(future.result())
                except TopicError as e:
                    failed.append(str(e))
                    consecutive_failures += 1
                    if consecutive_failures == MAX_CONSECUTIVE_FAILURES:
                        console.print(
                            f"[red]{MAX_CONSECUTIVE_FAILURES} topics in a row could not be "
                            "downloaded, stopping: Firecrawl may be down or overloaded. "
                            "Run the stage again to resume.[/red]"
                        )
                        break
                    continue
                consecutive_failures = 0
                if len(pending) >= COMMIT_EVERY:
                    flush()
    except FirecrawlFatalError as e:
        console.print(f"[red]Firecrawl error, stopping:[/red] {e}")
        console.print("Run the stage again to resume.")
    except KeyboardInterrupt:
        console.print("[yellow]Interrupted.[/yellow]")
    finally:
        pool.shutdown(wait=False, cancel_futures=True)
        flush()

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


def fetch_topic(firecrawl: Firecrawl, topic_id: int) -> tuple[dict, list[dict]]:
    """Download every page of a topic; return its row and its photo rows."""
    page = _scrape(firecrawl, TOPIC_URL.format(topic_id=topic_id))
    if page is None:
        topic = {"topic_id": topic_id, "url": None, "pages": 0}
        return topic | dict.fromkeys(TAXONOMY_RANKS.values(), ""), []

    soup = BeautifulSoup(page.html, "html.parser")
    # The canonical topic URL ends with a slash, e.g. .../topic/24260-abortiporus-biennis/
    url = canonical_url(soup) or page.url
    pages = page_count(soup)
    taxonomy = parse_taxonomy(soup)
    photos = parse_photos(soup)
    for number in range(2, pages + 1):
        next_page = _scrape(firecrawl, f"{url}page/{number}/")
        if next_page is None:
            raise TopicError(f"Topic {topic_id}: page {number} not available")
        photos += parse_photos(BeautifulSoup(next_page.html, "html.parser"))

    rows: list[dict] = []
    seen: set[str] = set()
    for photo in photos:
        if photo["url"] in seen:  # the same photo posted again
            continue
        seen.add(photo["url"])
        rows.append(photo | {"topic_id": topic_id, "position": len(rows) + 1})
    return {"topic_id": topic_id, "url": url, "pages": pages} | taxonomy, rows


def _scrape(firecrawl: Firecrawl, url: str) -> ScrapedPage | None:
    """Scrape `url` through Firecrawl; None when the page is not available."""
    try:
        page = firecrawl.scrape_page(url)
    except FirecrawlFatalError:
        raise
    except FirecrawlError as e:
        raise TopicError(str(e)) from e
    if page.status_code in UNAVAILABLE_STATUSES:
        return None
    if page.status_code >= 400:
        raise TopicError(f"{url}: HTTP {page.status_code}")
    return page


def canonical_url(soup: BeautifulSoup) -> str | None:
    link = soup.select_one("link[rel='canonical'][href]")
    href = link.get("href") if link is not None else None
    return href if isinstance(href, str) and href.endswith("/") else None


def page_count(soup: BeautifulSoup) -> int:
    pagination = soup.select_one("[data-pages]")
    value = pagination.get("data-pages", "") if pagination else ""
    return int(value) if isinstance(value, str) and value.isdigit() else 1


def parse_taxonomy(soup: BeautifulSoup) -> dict[str, str]:
    """The ranks of the "Tassonomia" section of the species card (the first post),
    keyed by column; '' for the ranks it does not give."""
    taxonomy = dict.fromkeys(TAXONOMY_RANKS.values(), "")
    content = soup.select_one(FIRST_POST_SELECTOR)
    if content is None:
        return taxonomy
    lines = _lines(copy.copy(content))
    start = next(
        (
            i
            for i, line in enumerate(lines)
            if line.rstrip(" :").casefold() == TAXONOMY_HEADER
        ),
        None,
    )
    if start is None:
        return taxonomy
    for line in lines[start + 1 :]:
        match = RANK_LINE.match(line)
        if match is None:
            break
        rank, value = match.groups()
        if rank in TAXONOMY_RANKS:
            # Drop the author and the zero width spaces some cards end names with.
            name = TAXON_NAME.match(value.strip("\ufeff\u200b "))
            column = TAXONOMY_RANKS[rank]
            if name and not taxonomy[column]:
                taxonomy[column] = TAXON_FIXES.get(name.group(), name.group())
        elif rank not in OTHER_RANKS:
            break
    return taxonomy


def parse_photos(soup: BeautifulSoup) -> list[dict]:
    """Photos posted on a topic page, in order, as {post_id, url, thumbnail_url, region}.

    Every photo gets the region of its post's caption: no post seen names more
    than one.
    """
    photos: list[dict] = []
    for article in soup.select("article[id^='elComment_']"):
        content = article.select_one("[data-role='commentContent']")
        post_id = article["id"].removeprefix("elComment_")
        if content is None or not post_id.isdigit():
            continue
        for quote in content.select("blockquote"):
            quote.decompose()  # quoted photos belong to another post
        post_photos = [
            photo for img in content.find_all("img") if (photo := _photo(img))
        ]
        if not post_photos:
            continue
        region = caption_region(_lines(content))
        photos += [
            photo | {"post_id": int(post_id), "region": region} for photo in post_photos
        ]
    return photos


def _lines(content: Tag) -> list[str]:
    """The text of `content` split at line breaks and block elements, so the inline
    markup of a caption (e.g. the species in italics) stays on its line. Changes
    `content`."""
    for br in content.find_all("br"):
        br.replace_with(NavigableString("\n"))
    for block in content.find_all(BLOCK_TAGS):
        block.append(NavigableString("\n"))
    lines = (" ".join(line.split()) for line in content.get_text().split("\n"))
    return [line for line in lines if line]


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
    if not parsed.netloc.endswith("funghiitaliani.it") or not PHOTO_PATH.match(
        parsed.path
    ):
        return None
    return parsed._replace(scheme="https", query="", fragment="").geturl()
