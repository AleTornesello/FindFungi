# scraper

Multi-stage interactive CLI that builds the FindFungi mushroom database.

## Setup

```sh
cp .env.example .env   # then edit the connection values
docker compose -f ../docker-compose.yaml up -d db
uv run scraper
```

## Stages

1. **Setup database**: creates the `mushrooms` table (the flattened structure of
   `data/8.json`). If the table already exists, you can clean it, recreate it or leave it.
