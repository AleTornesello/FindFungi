-- Reports of missing or wrong information on a species page.
--
-- Signed-in users and anonymous visitors send them from the species page, through
-- the report-issue edge function, and they are reviewed by hand in the dashboard:
-- filter `status = 'open'`, fix the data at its source, then set `status`,
-- `review_note` and `resolved_at`.
--
-- Rows carry the user id of signed-in senders, from their session, and a salted
-- hash of the sender's IP, used only to limit how many reports each sender can
-- send in an hour: never the IP itself.

CREATE TYPE report_kind   AS ENUM ('missing', 'wrong');
CREATE TYPE report_status AS ENUM ('open', 'resolved', 'rejected');

CREATE TABLE species_reports (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Null if the species later disappears from the dataset; the name keeps the report readable.
    mushroom_id      integer REFERENCES mushrooms (id) ON DELETE SET NULL,
    scientific_name  text NOT NULL CHECK (length(scientific_name) BETWEEN 1 AND 200),
    kind             report_kind NOT NULL,
    -- The part of the page the report is about; null for the species as a whole. The same list
    -- as REPORT_FIELDS in supabase/functions/report-issue/report.ts and frontend/src/data/reports.ts.
    field            text CHECK (field IN (
                         'commonNameIt', 'commonNameEn', 'edibility', 'toxicity',
                         'cap', 'hymenium', 'lamella', 'stipe', 'gleba', 'sporePrint',
                         'ecology', 'conservationStatus', 'taxonomy', 'photos', 'other')),
    message          text NOT NULL CHECK (length(message) BETWEEN 5 AND 2000),
    -- Where the right information comes from: a book, a URL, a key.
    source           text CHECK (length(source) BETWEEN 1 AND 500),
    -- Language of the UI the report was written in.
    locale           text NOT NULL CHECK (locale IN ('it', 'en')),
    -- Null for anonymous reports; set to null too if the account is deleted.
    user_id          uuid REFERENCES auth.users (id) ON DELETE SET NULL,
    -- Hex SHA-256 of a secret salt and the sender's IP, to rate-limit anonymous senders.
    ip_hash          text,
    status           report_status NOT NULL DEFAULT 'open',
    review_note      text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    resolved_at      timestamptz
);

CREATE INDEX species_reports_open_idx        ON species_reports (created_at) WHERE status = 'open';
CREATE INDEX species_reports_ip_hash_idx     ON species_reports (ip_hash, created_at);
CREATE INDEX species_reports_user_id_idx     ON species_reports (user_id, created_at);
CREATE INDEX species_reports_mushroom_id_idx ON species_reports (mushroom_id);

-- Like the other tables: no policies. The browser sends reports through the
-- report-issue edge function.
ALTER TABLE species_reports ENABLE ROW LEVEL SECURITY;
