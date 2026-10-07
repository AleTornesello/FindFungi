-- Finds that users chose to share anonymously from the "My finds" page.
--
-- Only the species, the date and, if the browser granted it, the position are
-- shared: the free-text place and notes stay in the user's browser, since they
-- could identify them. Rows carry no user or device id.

CREATE TABLE shared_finds (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Null if the species later disappears from the dataset; the name keeps the find readable.
    mushroom_id      integer REFERENCES mushrooms (id) ON DELETE SET NULL,
    scientific_name  text NOT NULL CHECK (length(scientific_name) BETWEEN 1 AND 200),
    found_on         date NOT NULL,
    latitude         double precision CHECK (latitude BETWEEN -90 AND 90),
    longitude        double precision CHECK (longitude BETWEEN -180 AND 180),
    accuracy_m       real CHECK (accuracy_m >= 0),  -- radius of the browser's estimate, in meters
    created_at       timestamptz NOT NULL DEFAULT now(),
    CHECK ((latitude IS NULL) = (longitude IS NULL)),
    CHECK (accuracy_m IS NULL OR latitude IS NOT NULL)
);

CREATE INDEX shared_finds_mushroom_id_idx ON shared_finds (mushroom_id);

-- Like the other tables: no policies. The browser shares finds through the
-- share-find edge function, which also rejects dates in the future.
ALTER TABLE shared_finds ENABLE ROW LEVEL SECURITY;
