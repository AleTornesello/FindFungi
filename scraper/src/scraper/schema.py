"""Table definitions, in creation order.

Text columns use '' instead of NULL for "no value", matching the source data.
`class` and `order` are SQL keywords, hence taxon_*.
"""

# Final dataset, matching the structure of data/8.json: each JSON record's
# source, taxonomy and properties objects flattened into a single row.
MUSHROOMS = """
CREATE TABLE mushrooms (
    id                        integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- source
    funghi_italiani_id        integer NOT NULL UNIQUE,
    funghi_italiani_topic_id  integer,
    wikipedia_it_page_id      bigint,
    wikipedia_en_page_id      bigint,

    -- taxonomy
    kingdom                   text NOT NULL DEFAULT '',
    division                  text NOT NULL DEFAULT '',
    taxon_class               text NOT NULL DEFAULT '',
    taxon_order               text NOT NULL DEFAULT '',
    family                    text NOT NULL DEFAULT '',
    genus                     text NOT NULL,
    species                   text NOT NULL,

    -- common names, from the Wikipedia page of the same language
    common_name_it            text NOT NULL DEFAULT '',
    common_name_en            text NOT NULL DEFAULT '',

    -- properties
    edible                    boolean NOT NULL DEFAULT false,
    poisonous                 boolean NOT NULL DEFAULT false,
    toxicity_effect_it        text NOT NULL DEFAULT '',  -- funghi_italiani.toxicity
    microscopic               boolean NOT NULL DEFAULT false,
    cap                       text NOT NULL DEFAULT '',
    hymenium                  text NOT NULL DEFAULT '',
    lamella                   text NOT NULL DEFAULT '',
    stipe                     text NOT NULL DEFAULT '',
    gleba                     text NOT NULL DEFAULT '',
    spore_print               text NOT NULL DEFAULT '',
    ecology                   text NOT NULL DEFAULT '',
    conservation_status       text NOT NULL DEFAULT '',
    cover_image               text NOT NULL DEFAULT '',

    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX mushrooms_genus_species_idx ON mushrooms (genus, species);
"""

# Raw records from the funghiitaliani.it grid API (stage 2). Original API field
# names are noted next to each column.
FUNGHI_ITALIANI = """
CREATE TABLE funghi_italiani (
    id                  integer PRIMARY KEY,           -- id
    card_type           text NOT NULL DEFAULT '',      -- scheda: S, B or A
    topic_id            integer,                       -- topic (forum topic)
    genus               text NOT NULL,                 -- genere
    species             text NOT NULL,                 -- specie
    author              text NOT NULL DEFAULT '',      -- autore
    edibility           text NOT NULL DEFAULT '',      -- comme: C, C1, N, V, M or ''
    poisonous           boolean NOT NULL DEFAULT false, -- comme = V (velenoso)
    microscopic         boolean,                       -- micro: 1, 0 or '' (NULL)
    kingdom             text NOT NULL DEFAULT '',      -- regno
    division            text NOT NULL DEFAULT '',      -- divisione
    taxon_class         text NOT NULL DEFAULT '',      -- classe
    taxon_order         text NOT NULL DEFAULT '',      -- ordine
    family              text NOT NULL DEFAULT '',      -- famiglia
    toxicity            text NOT NULL DEFAULT '',      -- tossi (syndrome)
    toxicity_topic_id   integer,                       -- posttossi
    inserted_on         date,                          -- datains (YYYYMMDD)
    fetched_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX funghi_italiani_genus_species_idx ON funghi_italiani (genus, species);
"""

# Wikipedia lookup results (stage 3): one row per funghi_italiani record and
# language. page_id is NULL when no page exists, so a row always means "searched".
WIKIPEDIA_PAGES = """
CREATE TABLE wikipedia_pages (
    funghi_italiani_id  integer NOT NULL,
    lang                text NOT NULL,                 -- 'it' or 'en'
    searched_title      text NOT NULL,                 -- "<genus> <species>"
    page_id             bigint,
    page_title          text,                          -- differs if redirected
    searched_at         timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (funghi_italiani_id, lang)
);
"""

# funghiitaliani.it forum topics (stage 6), i.e. the detail pages linked from the
# grid. Several funghi_italiani records (synonyms) can share a topic. url is NULL
# when the topic does not exist, so a row always means "fetched".
FUNGHI_ITALIANI_TOPICS = """
CREATE TABLE funghi_italiani_topics (
    topic_id            integer PRIMARY KEY,           -- funghi_italiani.topic_id
    url                 text,                          -- canonical URL of page 1
    pages               integer NOT NULL DEFAULT 0,
    fetched_at          timestamptz NOT NULL DEFAULT now()
);
"""

# Photos posted in a funghiitaliani.it topic (stage 6), in page order.
FUNGHI_ITALIANI_PHOTOS = """
CREATE TABLE funghi_italiani_photos (
    topic_id            integer NOT NULL,              -- funghi_italiani_topics.topic_id
    position            integer NOT NULL,              -- 1-based, in page order
    post_id             integer NOT NULL,              -- forum post holding the photo
    url                 text NOT NULL,                 -- full size image
    thumbnail_url       text NOT NULL DEFAULT '',      -- '' when the post shows the full image
    PRIMARY KEY (topic_id, position)
);
"""

# Columns added after a table was first released, to bring tables created by an
# older version up to date. Every statement must be idempotent.
MIGRATIONS: dict[str, list[str]] = {
    "mushrooms": [
        "ALTER TABLE mushrooms ADD COLUMN IF NOT EXISTS common_name_it text NOT NULL DEFAULT ''",
        "ALTER TABLE mushrooms ADD COLUMN IF NOT EXISTS common_name_en text NOT NULL DEFAULT ''",
    ],
}

TABLES: dict[str, str] = {
    "funghi_italiani": FUNGHI_ITALIANI,
    "wikipedia_pages": WIKIPEDIA_PAGES,
    "mushrooms": MUSHROOMS,
    "funghi_italiani_topics": FUNGHI_ITALIANI_TOPICS,
    "funghi_italiani_photos": FUNGHI_ITALIANI_PHOTOS,
}
