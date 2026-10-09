# Species reports: missing or wrong information

Date: 2026-10-09
Status: approved design, awaiting spec review

## Goal

Let visitors tell us that information on a species page is missing or wrong, so the dataset can be
fixed. Reports can be sent by signed-in users and by anonymous visitors. They are reviewed by hand in
the Supabase dashboard.

Success looks like: from any species page, a visitor sends a report in a few taps; it lands in a
table with enough structure (species, field, kind) to triage it without reading every message; bots
and floods are kept out without bothering real users.

## Scope

In scope:

- A `species_reports` table, closed to the Data API (RLS on, no policies), like `shared_finds`.
- A `report-issue` edge function that validates, rate-limits and stores reports.
- A "Report missing or wrong info" dialog on the species detail page.
- Italian and English strings.

Out of scope (not built now):

- An admin UI: reports are read and closed in the Supabase Table Editor.
- Notifications (email or otherwise) on new reports.
- Letting users see the status of their reports.
- A contact email for anonymous reporters, and photo attachments.
- CAPTCHA (Turnstile).
- Reports that are not about a species (general site issues).

## Data model

Migration `supabase/migrations/<timestamp>_add_species_reports.sql`:

```sql
CREATE TYPE report_kind   AS ENUM ('missing', 'wrong');
CREATE TYPE report_status AS ENUM ('open', 'resolved', 'rejected');

CREATE TABLE species_reports (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Null if the species later disappears from the dataset; the name keeps the report readable.
    mushroom_id     integer REFERENCES mushrooms (id) ON DELETE SET NULL,
    scientific_name text NOT NULL CHECK (length(scientific_name) BETWEEN 1 AND 200),
    kind            report_kind NOT NULL,
    -- The part of the page the report is about; null for the species as a whole.
    field           text CHECK (field IN (
                        'commonNameIt', 'commonNameEn', 'edibility', 'toxicity',
                        'cap', 'hymenium', 'lamella', 'stipe', 'gleba', 'sporePrint',
                        'ecology', 'conservationStatus', 'taxonomy', 'photos', 'other')),
    message         text NOT NULL CHECK (length(message) BETWEEN 5 AND 2000),
    -- Where the right information comes from: a book, a URL, a key.
    source          text CHECK (length(source) BETWEEN 1 AND 500),
    -- Language of the UI the report was written in.
    locale          text NOT NULL CHECK (locale IN ('it', 'en')),
    -- Null for anonymous reports, and if the account is deleted.
    user_id         uuid REFERENCES auth.users (id) ON DELETE SET NULL,
    -- Salted SHA-256 of the sender's IP, only to rate-limit anonymous senders. Never the IP itself.
    ip_hash         text,
    status          report_status NOT NULL DEFAULT 'open',
    review_note     text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    resolved_at     timestamptz
);

CREATE INDEX species_reports_open_idx    ON species_reports (created_at) WHERE status = 'open';
CREATE INDEX species_reports_ip_hash_idx ON species_reports (ip_hash, created_at);
CREATE INDEX species_reports_user_id_idx ON species_reports (user_id, created_at);
CREATE INDEX species_reports_mushroom_id_idx ON species_reports (mushroom_id);

-- No policies: the browser sends reports through the report-issue edge function.
ALTER TABLE species_reports ENABLE ROW LEVEL SECURITY;
```

Field values map to the page as follows:

| `field`              | What it covers                                   |
|----------------------|--------------------------------------------------|
| `commonNameIt/En`    | Common names in Italian / English                 |
| `edibility`          | Edible / poisonous flags                          |
| `toxicity`           | Ingestion syndrome (`toxicityEffectIt`)           |
| `cap` … `sporePrint` | The matching characteristic                       |
| `ecology`            | Ecology                                           |
| `conservationStatus` | Conservation status                               |
| `taxonomy`           | Any classification rank                           |
| `photos`             | A wrong or missing photo, or a wrong region       |
| `other`              | Anything else on the page                         |

Review workflow: in the Table Editor, filter `status = open`, fix the data at its source, then set
`status` to `resolved` or `rejected`, optionally `review_note`, and `resolved_at`.

## Edge function `report-issue`

`supabase/functions/report-issue/index.ts`, built like `share-find`: same CORS headers, a
`postgres` client on `SUPABASE_DB_URL`, the same `requestUser()` to read the user from the token.

Request: `POST` JSON

```ts
{
  mushroomId: number | null
  scientificName: string
  kind: "missing" | "wrong"
  field?: Field | null        // one of the values in the table's check
  message: string
  source?: string | null
  locale: "it" | "en"
  website?: string            // honeypot, must be empty
}
```

Steps:

1. `OPTIONS` → 204; any method other than `POST` → 405.
2. Parse the body. Wrong types, or `kind`, `field`, `locale` outside their values → 400. Strings
   are trimmed; an empty `source` becomes null. Lengths are left to the table's checks.
3. Honeypot: if `website` is a non-empty string, return 204 without storing anything, so bots
   see success.
4. User: anon key → `null`; a verified signed-in token → its `sub`; a token that does not
   verify → 401. Never taken from the body.
5. IP hash: first entry of `x-forwarded-for`, hashed as hex SHA-256 of
   `REPORT_IP_SALT + ip`. If the header is missing, `ip_hash` is null (and only the user
   limit applies, if any).
6. Rate limit and insert in one statement:
   - anonymous: fewer than **10** reports with the same `ip_hash` in the last hour;
   - signed in: fewer than **30** reports with the same `user_id` in the last hour.
   ```sql
   INSERT INTO species_reports (...)
   SELECT ...
   WHERE (SELECT count(*) FROM species_reports
          WHERE <ip_hash = $hash | user_id = $user> AND created_at > now() - interval '1 hour') < <limit>
   RETURNING id
   ```
   No row inserted → 429. Concurrent bursts can overshoot the limit by a few rows; that is
   acceptable for spam control.
7. Check, foreign-key and data-format violations (`23514`, `23503`, `22*`) → 400
   `"Invalid report"`. Anything else → logged with `console.error`, 500.
8. Success → 204.

New secret: `REPORT_IP_SALT`, a random string set with `supabase secrets set`. If it is missing the
function fails at startup rather than storing unsalted hashes.

## Frontend

### `src/data/reports.ts`

- `ReportField` type and `REPORT_FIELDS` list, matching the table's check.
- `sendReport(report)`: calls `supabase.functions.invoke("report-issue", { body })`. Supabase
  sends the session token when a user is signed in, the anon key otherwise. Throws on error;
  distinguishes a 429 (`FunctionsHttpError` with `context.status === 429`) so the dialog can show
  a specific message.

### `src/components/ReportIssueDialog.tsx`

Chakra `Dialog`, styled like `ShareFindsDialog` (rounded content, icon badge, centered).
Props: `mushroom`, `open`, `onClose`.

- **Kind**: two radio cards, "Something is missing" / "Something is wrong". Required.
- **Field**: optional select, "Whole species" by default, then the fields in `REPORT_FIELDS`
  with labels reusing existing `detail.*` / property i18n keys where they exist.
- **Message**: textarea, required, 5–2000 characters, with a character counter. Placeholder
  changes with the kind ("What's missing?" / "What's wrong, and what's right?").
- **Source**: optional input, up to 500 characters.
- **Honeypot**: an input named `website`, off-screen, `aria-hidden`, `tabIndex={-1}`,
  `autoComplete="off"`.
- **Identity line**: "Sent as <email>" when signed in; "Sent anonymously · Sign in" with a link
  to `/login` when signed out (uses `useAuth`).
- **Submit**: disabled until kind and message are valid; shows a spinner while sending.
  - Success: the form is replaced by a thank-you message and a Close button.
  - 429: "You've sent many reports in a short time. Try again later."
  - Other errors: "Couldn't send the report. Check your connection and try again." The form
    keeps its content.
- Closing and reopening the dialog resets it.

### `MushroomDetailPage.tsx`

A discreet outline button with a `Flag` icon, "Report missing or wrong info", at the bottom of
the page after *Learn more*, opening the dialog.

### i18n

New `report.*` keys in `src/i18n/locales/en.ts` and `it.ts` for every string above.

## Privacy

Reports store the user id of signed-in senders and a salted hash of the IP of every sender. The
Privacy Policy page is still blank; when it is written it must mention both. No other personal
data is collected by this feature.

## Verification

The repo has no test framework, so:

- `npm run build` and `npm run lint` in `frontend/`.
- `supabase functions serve report-issue` locally, then curl:
  - valid anonymous report → 204, row with `user_id` null and an `ip_hash`;
  - valid report with a user token → 204, row with `user_id`;
  - honeypot filled → 204, no row;
  - bad `kind` / missing `message` / message of 3 characters → 400;
  - forged token → 401;
  - 11th anonymous report from the same IP within an hour → 429.
- Manual check of the dialog in the app, signed in and signed out, in both languages, at phone
  width.
