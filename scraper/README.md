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
   `funghi_italiani` (raw API data), `wikipedia_pages`, `mushrooms` (the flattened structure of
   `data/8.json`), `funghi_italiani_topics` and `funghi_italiani_photos`. Missing tables are created. If some already exist, you can clean
   them, recreate them or leave them.
2. **Download data from funghiitaliani.it**: reads every record from the grid API
   (100 per page, with retries) and saves it into `funghi_italiani`, setting
   `poisonous` for the records with edibility code `V` (velenoso). If the table
   already has rows, you can replace them or update them (upsert).
3. **Search Wikipedia pages**: for every `funghi_italiani` record, looks up a
   "<genus> <species>" page on it.wikipedia.org and en.wikipedia.org (50 titles per
   request, following redirects) and saves the result into `wikipedia_pages`, with a
   NULL `page_id` when there is no page. On later runs you can search only the
   mushrooms not searched yet, or all of them again.
4. **Scrape Wikipedia data**: for every `funghi_italiani` record with a Wikipedia
   page, scrapes the infoboxes of the Italian page (or the English one when there is
   no Italian page) through the [Firecrawl](https://www.firecrawl.dev) API and saves
   a row into `mushrooms`: taxonomy, edibility, `poisonous` and `toxicity_effect_it` (the
   ingestion syndrome, in Italian) from funghiitaliani.it, morphology
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
6. **Download photos from funghiitaliani.it topics**: for every `topic_id` in
   `funghi_italiani` (the detail page linked from the grid, a forum topic shared by
   synonyms), reads all the pages of the topic and saves the photos posted in it into
   `funghi_italiani_photos`, in page order: the forum post id, the full size image URL
   and, when the post shows a smaller one, the thumbnail URL. Avatars, badges,
   emoticons, quoted posts and images hosted elsewhere are skipped; a photo posted
   twice is kept once. Every fetched topic gets a row in `funghi_italiani_topics`, with
   a NULL `url` when it is deleted or restricted. Only the URLs are stored, not the
   files. Join on `mushrooms.funghi_italiani_topic_id` to get the photos of a mushroom.
   Topics are committed in batches: on later runs you can download only the topics
   not fetched yet, or all of them again (e.g. to pick up new posts).
7. **Export to JSON**: writes the `mushrooms` table to a JSON file (by default
   `data/mushrooms.json`). Its `mushrooms` list has the structure of `data/8.json`:
   `id`, a `taxonomy` and a `properties` object with camelCase keys. Its `images`
   property lists the Wikipedia cover image first, then the funghiitaliani.it photos
   of stage 6 in page order. The funghiitaliani.it and Wikipedia ids and the
   timestamps are not exported. Its
   `translations` object holds, per language and property, the translation of every
   characteristic value (e.g. `translations.it.cap["convex or flat"]` is
   `"convesso o piatto"`), built from the dictionaries in `src/scraper/translations.py`;
   compound values are translated part by part. Values missing from a dictionary are
   listed on screen and shown in English by the app. To add a language, add its
   dictionaries to that file and export again.
