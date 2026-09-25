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

    -- properties
    edible                    boolean NOT NULL DEFAULT false,
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

TABLES: dict[str, str] = {
    "funghi_italiani": FUNGHI_ITALIANI,
    "mushrooms": MUSHROOMS,
}
