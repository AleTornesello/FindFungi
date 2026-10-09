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
   `funghi_italiani` (raw API data), `funghi_italiani_topics`, `funghi_italiani_photos`,
   `wikipedia_pages` and `mushrooms` (the flattened structure of `data/8.json`).
   Missing tables are created, and
   existing ones get the columns added since they were created. If some already exist,
   you can clean them, recreate them or leave them.
2. **Download data from funghiitaliani.it**: reads every record from the grid API
   (100 per page, with retries) and saves it into `funghi_italiani`, setting
   `poisonous` for the records with edibility code `V` (velenoso). If the table
   already has rows, you can replace them or update them (upsert).
3. **Download funghiitaliani.it topics**: for every `topic_id` in `funghi_italiani`
   (the detail page linked from the grid, a forum topic shared by synonyms), reads
   all the pages of the topic through the [Firecrawl](https://www.firecrawl.dev) API
   (at most 4 at a time, however high `FIRECRAWL_CONCURRENCY` is) and saves:
   - the taxonomy of the species card, the first post of the topic, into
     `funghi_italiani_topics`: the `kingdom` (rarely given), `division`, `taxon_class`,
     `taxon_order` and `family` lines of its "Tassonomia" section ("Divisione
     Basidiomycota", "Famiglia Tricholomataceae (Fayod) R. Heim ex Pouzar"), without
     the authors; the other ranks (genus, section, …) are skipped. Misspelled names
     are fixed with `TAXON_FIXES` in `src/scraper/stages/funghi_italiani_topics.py`;
     add more there. A rank the card does not give is ''.
   - the photos posted in it into `funghi_italiani_photos`, in page order: the forum
     post id, the full size image URL and, when the post shows a smaller one, the
     thumbnail URL, and the `region` the photo was taken in. The region comes from
     the caption of the post ("…; Regione Lombardia, Brallo (PV); Ottobre 2010; Foto
     di …", see `src/scraper/regions.py`): a province code in brackets gives its
     region and wins over the region names on the same line ("Parco Nazionale
     d'Abruzzo Lazio e Molise - Villetta Barrea (AQ)" is Abruzzo); region names count
     on lines that say "Regione" or "Foto" or are short, so the descriptions are
     skipped. It is '' when the post names no Italian region (e.g. a place abroad).
     Avatars, badges, emoticons, quoted posts and images hosted elsewhere are skipped;
     a photo posted twice is kept once. Only the URLs are stored, not the files. Join
     on `mushrooms.funghi_italiani_topic_id` to get the photos of a mushroom.

   Every fetched topic gets a row in `funghi_italiani_topics`, with a NULL `url` when
   it is deleted. Firecrawl reports a restricted topic as an anti-bot block
   (`SCRAPE_RETRY_LIMIT`), so those are listed as failed and tried again on the next
   run instead of being saved. The stage checks that Firecrawl answers before
   starting, and stops (keeping the topics already saved) when it cannot be reached
   anymore or when 10 topics in a row fail, e.g. because it keeps dropping
   connections. Older tables get the new columns when the stage (or
   stage 1) runs; their topics have no taxonomy until they are downloaded again.
   Topics are committed in batches: on later runs you can download only the topics
   not fetched yet, or all of them again (e.g. to pick up new posts or fill the
   taxonomy).
4. **Search Wikipedia pages**: for every `funghi_italiani` record, looks up a
   "<genus> <species>" page on it.wikipedia.org and en.wikipedia.org (50 titles per
   request, following redirects) and saves the result into `wikipedia_pages`, with a
   NULL `page_id` when there is no page. On later runs you can search only the
   mushrooms not searched yet, or all of them again.
5. **Build mushrooms**: saves a row into `mushrooms` for every `funghi_italiani`
   record. The taxonomy (`kingdom` to `family`) comes from the species card of its
   topic (stage 3), rank by rank: the ranks the card does not give, or all of them
   when the topic was not downloaded, come from the grid record, and a kingdom still
   missing comes from the division (`DIVISION_KINGDOMS` in
   `src/scraper/stages/mushrooms.py`). Genus and species are the grid record's, so
   synonyms keep their own name. Edibility, `poisonous` and `toxicity_effect_it` (the
   ingestion syndrome, in Italian) come from funghiitaliani.it. For the records with a
   Wikipedia page, it scrapes the infoboxes of the Italian page (or the English one
   when there is no Italian page) through the Firecrawl API for the morphology
   (cap, hymenium, lamella, stipe, gleba, spore print, ecology), conservation status,
   cover image and common names; the records without a page keep them ''. The
   edibility row of the Wikipedia infobox ("Commestibilità", "Edibility is ...") can make `edible` and `poisonous` more
   cautious, never less: when the two sources disagree the more dangerous level wins
   (poisonous > not edible > edible). A value listing several levels ("edible or
   poisonous", "edible but not recommended") counts as its most dangerous one; an
   unknown edibility leaves the funghiitaliani.it data unchanged. Psychoactive species
   count as poisonous. The cover image is the first infobox picture outside the
   morphology box that is not a conservation status chart or in `COVER_BLACKLIST`;
   add URLs there to skip more. The common names go into `common_name_it` or
   `common_name_en`, by the language of the page: on Italian pages they are the
   "Nomi comuni" of the taxobox (names in other languages are skipped); on English
   pages, and Italian ones without that row, they are the bold, non-italic terms of
   the lead ("commonly known as the **field mushroom**"). Several names are comma
   separated. Needs `FIRECRAWL_API_KEY` in `.env` (without it
   the keyless rate limits apply); `FIRECRAWL_CONCURRENCY` sets the parallel requests.
   Rows are committed in batches: on later runs you can scrape only the mushrooms not
   saved yet (e.g. after an interruption or failed pages) or all of them again.
6. **Normalize characteristics**: translates the Italian values of the characteristic
   columns of `mushrooms` (cap, hymenium, lamella, stipe, gleba, spore print, ecology,
   conservation status) to lowercase English with the dictionaries in
   `src/scraper/stages/normalize.py`; compound values like "convex or flat" are
   translated part by part. Conservation statuses become IUCN categories
   ("vulnerabile" → "vulnerable"); the source of English pages is dropped
   ("Vulnerable (IUCN 3.1)" → "vulnerable"). Values not in the dictionaries are left unchanged and
   listed on screen. Running it again changes nothing.
7. **Export to JSON**: writes the `mushrooms` table to a JSON file (by default
   `data/mushrooms.json`). Its `mushrooms` list has the structure of `data/8.json`:
   `id`, a `taxonomy` and a `properties` object with camelCase keys. Its `images`
   property lists the Wikipedia cover image first, then the funghiitaliani.it photos
   of stage 3 in page order; `commonNameIt` and `commonNameEn` hold the common names
   of stage 5. The funghiitaliani.it and Wikipedia ids and the
   timestamps are not exported. Its
   `translations` object holds, per language and property, the translation of every
   characteristic value (e.g. `translations.it.cap["convex or flat"]` is
   `"convesso o piatto"`), built from the dictionaries in `src/scraper/translations.py`;
   compound values are translated part by part. Values missing from a dictionary are
   listed on screen and shown in English by the app. To add a language, add its
   dictionaries to that file and export again.
