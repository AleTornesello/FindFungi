# scraper

Multi-stage interactive CLI that builds the FindFungi mushroom database.

## Setup

```sh
cp .env.example .env   # then edit the connection values and the Firecrawl key
docker compose -f ../docker-compose.yaml up -d db
uv run scraper
```

## Stages

1. **Setup database**: creates the tables defined in `src/scraper/schema.py`:
   `funghi_italiani` (raw API data), `wikipedia_pages` and `mushrooms` (the flattened structure of
   `data/8.json`). Missing tables are created. If some already exist, you can clean
   them, recreate them or leave them.
2. **Download data from funghiitaliani.it**: reads every record from the grid API
   (100 per page, with retries) and saves it into `funghi_italiani`. If the table
   already has rows, you can replace them or update them (upsert).
3. **Search Wikipedia pages**: for every `funghi_italiani` record, looks up a
   "<genus> <species>" page on it.wikipedia.org and en.wikipedia.org (50 titles per
   request, following redirects) and saves the result into `wikipedia_pages`, with a
   NULL `page_id` when there is no page. On later runs you can search only the
   mushrooms not searched yet, or all of them again.
4. **Scrape Wikipedia data**: for every `funghi_italiani` record with a Wikipedia
   page, scrapes the infoboxes of the Italian page (or the English one when there is
   no Italian page) through the [Firecrawl](https://www.firecrawl.dev) API and saves
   a row into `mushrooms`: taxonomy and edibility from funghiitaliani.it, morphology
   (cap, hymenium, lamella, stipe, gleba, spore print, ecology), conservation status
   and cover image from Wikipedia. Needs `FIRECRAWL_API_KEY` in `.env` (without it
   the keyless rate limits apply); `FIRECRAWL_CONCURRENCY` sets the parallel requests.
   Rows are committed in batches: on later runs you can scrape only the mushrooms not
   saved yet (e.g. after an interruption or failed pages) or all of them again.
5. **Normalize characteristics**: translates the Italian values of the characteristic
   columns of `mushrooms` (cap, hymenium, lamella, stipe, gleba, spore print, ecology,
   conservation status) to English with the dictionaries in
   `src/scraper/stages/normalize.py`; compound values like "convex or flat" are
   translated part by part. Values not in the dictionaries are left unchanged and
   listed on screen. Running it again changes nothing.
