"""Minimal client for the Firecrawl scrape API (https://docs.firecrawl.dev)."""

import time
from dataclasses import dataclass

import httpx

from scraper.config import FirecrawlConfig

MAX_ATTEMPTS = 5
TIMEOUT = 90  # Firecrawl renders the page, so a scrape can take a while

CHECK_TIMEOUT = 10

# Retrying cannot fix these: bad key, no credits left, forbidden.
FATAL_STATUSES = {401, 402, 403}
# The API cannot be reached at all (e.g. a stopped self-hosted instance or a wrong
# FIRECRAWL_API_URL), as opposed to a single request failing.
UNREACHABLE_ERRORS = (httpx.ConnectError, httpx.ConnectTimeout)
# Error code prefix of the scrapes that Firecrawl ran and gave up on.
SCRAPE_ERROR_PREFIX = "SCRAPE_"


class FirecrawlError(Exception):
    """A single scrape failed; other scrapes may still succeed."""


class FirecrawlFatalError(FirecrawlError):
    """Every further scrape would fail too (e.g. invalid key or no credits)."""


@dataclass(frozen=True)
class ScrapedPage:
    html: str
    status_code: int  # of the scraped page, not of the Firecrawl API
    url: str  # after redirects


class Firecrawl:
    def __init__(self, config: FirecrawlConfig):
        headers = {"Authorization": f"Bearer {config.api_key}"} if config.api_key else {}
        self._api_url = config.api_url
        # httpx.Client is thread-safe, so one instance serves all workers.
        self._client = httpx.Client(
            base_url=config.api_url, headers=headers, timeout=TIMEOUT
        )

    def close(self) -> None:
        self._client.close()

    def check_connection(self) -> None:
        """Raise FirecrawlFatalError, without retrying, when the API does not answer.

        Any HTTP response counts as an answer: this only checks that the API is
        reachable (e.g. that a self-hosted instance is running), not the key.
        """
        try:
            self._client.get("/", timeout=CHECK_TIMEOUT)
        except httpx.TransportError as e:
            raise FirecrawlFatalError(_unreachable_message(self._api_url, e)) from e

    def scrape_html(self, url: str, include_tags: list[str]) -> str:
        """Return the HTML of the elements of `url` matching `include_tags`."""
        data = self._scrape(
            {
                "url": url,
                "formats": ["html"],
                "includeTags": include_tags,
                "onlyMainContent": False,
            }
        )
        return data.get("html", "")

    def scrape_page(self, url: str) -> ScrapedPage:
        """Return the unmodified HTML of `url`, with its status code and final URL.

        Unlike the API errors, an error status of the page itself (e.g. 404) does not
        raise: the caller decides what it means.
        """
        data = self._scrape({"url": url, "formats": ["rawHtml"], "onlyMainContent": False})
        metadata = data.get("metadata") or {}
        status = metadata.get("statusCode")
        return ScrapedPage(
            html=data.get("rawHtml", ""),
            status_code=status if isinstance(status, int) else 200,
            url=metadata.get("url") or metadata.get("sourceURL") or url,
        )

    def _scrape(self, body: dict) -> dict:
        url = body["url"]
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                response = self._client.post("/v2/scrape", json=body)
            except httpx.TransportError as e:
                if attempt == MAX_ATTEMPTS:
                    if isinstance(e, UNREACHABLE_ERRORS):
                        # The API itself is down: every further scrape would fail too.
                        raise FirecrawlFatalError(
                            _unreachable_message(self._api_url, e)
                        ) from e
                    raise FirecrawlError(f"{url}: {e}") from e
                time.sleep(2**attempt)
                continue

            if response.status_code in FATAL_STATUSES:
                raise FirecrawlFatalError(_error_message(response))
            if response.status_code >= 500 and _scrape_failed(response):
                # Firecrawl reached the page and already retried it, e.g.
                # SCRAPE_RETRY_LIMIT when the site answers like an anti-bot block:
                # retrying again would only repeat that.
                raise FirecrawlError(f"{url}: {_error_message(response)}")
            if response.status_code == 429 or response.status_code >= 500:
                if attempt == MAX_ATTEMPTS:
                    raise FirecrawlError(f"{url}: {_error_message(response)}")
                time.sleep(_retry_after(response) or 2**attempt)
                continue
            if response.is_error:
                raise FirecrawlError(f"{url}: {_error_message(response)}")

            data = response.json()
            if not data.get("success"):
                raise FirecrawlError(f"{url}: {data.get('error', 'unknown error')}")
            return data["data"]
        raise AssertionError("unreachable")


def _retry_after(response: httpx.Response) -> float | None:
    value = response.headers.get("Retry-After", "")
    return float(value) if value.isdigit() else None


def _scrape_failed(response: httpx.Response) -> bool:
    """Whether an error response reports a failed scrape (codes like SCRAPE_TIMEOUT,
    SCRAPE_RETRY_LIMIT) rather than a problem of Firecrawl itself."""
    try:
        code = response.json().get("code", "")
    except (ValueError, AttributeError):
        return False
    return isinstance(code, str) and code.startswith(SCRAPE_ERROR_PREFIX)


def _unreachable_message(api_url: str, error: Exception) -> str:
    detail = str(error) or type(error).__name__
    return (
        f"Could not connect to Firecrawl at {api_url} ({detail}). Is it running? "
        "Check FIRECRAWL_API_URL in .env."
    )


def _error_message(response: httpx.Response) -> str:
    try:
        detail = response.json().get("error", "")
    except ValueError:
        detail = response.text[:200]
    return f"HTTP {response.status_code} {detail}".strip()
