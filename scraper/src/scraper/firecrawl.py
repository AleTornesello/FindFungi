"""Minimal client for the Firecrawl scrape API (https://docs.firecrawl.dev)."""

import time

import httpx

from scraper.config import FirecrawlConfig

MAX_ATTEMPTS = 5
TIMEOUT = 90  # Firecrawl renders the page, so a scrape can take a while

# Retrying cannot fix these: bad key, no credits left, forbidden.
FATAL_STATUSES = {401, 402, 403}


class FirecrawlError(Exception):
    """A single scrape failed; other scrapes may still succeed."""


class FirecrawlFatalError(FirecrawlError):
    """Every further scrape would fail too (e.g. invalid key or no credits)."""


class Firecrawl:
    def __init__(self, config: FirecrawlConfig):
        headers = {"Authorization": f"Bearer {config.api_key}"} if config.api_key else {}
        # httpx.Client is thread-safe, so one instance serves all workers.
        self._client = httpx.Client(
            base_url=config.api_url, headers=headers, timeout=TIMEOUT
        )

    def close(self) -> None:
        self._client.close()

    def scrape_html(self, url: str, include_tags: list[str]) -> str:
        """Return the HTML of the elements of `url` matching `include_tags`."""
        body = {
            "url": url,
            "formats": ["html"],
            "includeTags": include_tags,
            "onlyMainContent": False,
        }
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                response = self._client.post("/v2/scrape", json=body)
            except httpx.TransportError as e:
                if attempt == MAX_ATTEMPTS:
                    raise FirecrawlError(f"{url}: {e}") from e
                time.sleep(2**attempt)
                continue

            if response.status_code in FATAL_STATUSES:
                raise FirecrawlFatalError(_error_message(response))
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
            return data["data"].get("html", "")
        raise AssertionError("unreachable")


def _retry_after(response: httpx.Response) -> float | None:
    value = response.headers.get("Retry-After", "")
    return float(value) if value.isdigit() else None


def _error_message(response: httpx.Response) -> str:
    try:
        detail = response.json().get("error", "")
    except ValueError:
        detail = response.text[:200]
    return f"HTTP {response.status_code} {detail}".strip()
