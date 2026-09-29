# scraper

Multi-stage interactive CLI that builds the FindFungi mushroom database.

## Setup

```sh
cp .env.example .env   # then edit the connection values
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
