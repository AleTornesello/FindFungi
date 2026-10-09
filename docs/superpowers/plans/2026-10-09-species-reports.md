# Species Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let signed-in and anonymous visitors report missing or wrong information on a species page, stored in Supabase for manual review.

**Architecture:** A `species_reports` table with RLS on and no policies, written only by a new `report-issue` edge function. The function takes the user id from the session token, drops honeypot submissions and rate-limits senders by user id or salted IP hash. A `ReportIssueDialog` on the species detail page sends reports through `supabase.functions.invoke`, as `shareFind()` does for finds.

**Tech Stack:** Postgres (Supabase), Supabase Edge Functions (Deno, `postgres` npm client), React 19 + TypeScript + Chakra UI v3, lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-10-09-species-reports-design.md`

## Global Constraints

- `kind` is `missing` or `wrong`; `status` is `open`, `resolved` or `rejected`, default `open`.
- `field` is null (the species as a whole) or one of: `commonNameIt`, `commonNameEn`, `edibility`, `toxicity`, `cap`, `hymenium`, `lamella`, `stipe`, `gleba`, `sporePrint`, `ecology`, `conservationStatus`, `taxonomy`, `photos`, `other`.
- `message` 5–2000 characters; `source` 1–500 characters or null; `scientific_name` 1–200 characters; `locale` `it` or `en`.
- Rate limits: anonymous fewer than **10** reports per `ip_hash` per hour; signed in fewer than **30** per `user_id` per hour.
- The IP is never stored: only hex SHA-256 of `REPORT_IP_SALT + ip`. The function refuses to start without `REPORT_IP_SALT`.
- The user id comes only from the verified token, never from the body.
- Honeypot field name: `website`. Filled in → 204, nothing stored.
- Responses: 204 success, 400 bad body/invalid report, 401 bad session, 405 wrong method, 429 rate limited, 500 insert failure.
- Every UI string exists in both `en.ts` and `it.ts`. The dialog works at phone width.
- Code style: edge functions use semicolons and double quotes (like `share-find`); the frontend uses no semicolons and double quotes. Commit messages are full sentences in the style of `git log` (no `feat:` prefixes).
- Nothing is applied to or deployed on the remote Supabase project without the user's go-ahead.

## Review Focus

- **Whitespace-only or padded message** (`"   ab   "`): it must be trimmed before the length check and rejected with 400, not stored as 8 characters. Pinned by a parse test in Task 2 and a curl case in Task 3.
- **Species id that no longer exists** (the app caches the dataset for 7 days, so a removed species can still be open): the report must still be stored, with `mushroom_id` null and the name kept, not fail with a foreign-key 400. Pinned by a curl case in Task 3.
- **`x-forwarded-for` with several hops or spaces** (`"203.0.113.7, 10.0.0.1"`): only the first, trimmed address is hashed, so one sender always gets the same hash. Pinned by tests in Task 2.
- **Session that expired while the dialog was open**: the 401 must show an "expired session" message, not the generic connection error. Pinned by the 401 mapping in Task 4 and a manual check in Task 5.
- **Double tap on Send**: only one report is stored. The button is in loading state, and disabled, while sending. Pinned by a manual check in Task 5.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `supabase/migrations/20261009220000_add_species_reports.sql` (create) | Enums, `species_reports` table, indexes, RLS |
| `supabase/functions/report-issue/report.ts` (create) | Pure parsing of the request body, client IP and IP hashing; no I/O |
| `supabase/functions/report-issue/report_test.ts` (create) | Deno tests for `report.ts` |
| `supabase/functions/report-issue/index.ts` (create) | HTTP handler: CORS, auth, rate limit + insert |
| `frontend/src/data/reports.ts` (create) | Report types, limits and `sendReport()` |
| `frontend/src/i18n/locales/en.ts`, `it.ts` (modify) | `report.*` strings |
| `frontend/src/components/ReportIssueDialog.tsx` (create) | The report form dialog |
| `frontend/src/pages/MushroomDetailPage.tsx` (modify) | "Report missing or wrong info" button opening the dialog |

The field list exists three times: in the migration's check, in `report.ts` and in `frontend/src/data/reports.ts`. They are deployed separately, so each copy carries a comment pointing at the others.

---

### Task 1: `species_reports` migration

**Files:**
- Create: `supabase/migrations/20261009220000_add_species_reports.sql`
- Test: `<scratchpad>/species-reports-test/` (throwaway SQL, not committed)

**Interfaces:**
- Consumes: the existing `mushrooms (id integer)` table and `auth.users (id uuid)`.
- Produces: table `species_reports` with columns `id, mushroom_id, scientific_name, kind, field, message, source, locale, user_id, ip_hash, status, review_note, created_at, resolved_at`; enums `report_kind`, `report_status`.

- [ ] **Step 1: Write the failing test**

Create `<scratchpad>/species-reports-test/stubs.sql`. It holds stand-ins for the Supabase tables that the migration references:

```sql
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE TABLE mushrooms (id integer PRIMARY KEY);
INSERT INTO mushrooms VALUES (1);
```

Create `<scratchpad>/species-reports-test/tests.sql`:

```sql
-- A valid report is stored, open.
INSERT INTO species_reports (mushroom_id, scientific_name, kind, field, message, locale, ip_hash)
VALUES (1, 'Amanita muscaria', 'wrong', 'cap', 'The cap is red, not blue.', 'en', 'abc');
DO $$ BEGIN
  ASSERT (SELECT status FROM species_reports) = 'open', 'new reports must be open';
END $$;

-- A report about the species as a whole has no field.
INSERT INTO species_reports (scientific_name, kind, message, locale)
VALUES ('Amanita muscaria', 'missing', 'No common names at all.', 'it');

-- Each of these must be refused by a check.
DO $$
DECLARE bad text;
BEGIN
  FOREACH bad IN ARRAY ARRAY[
    $q$INSERT INTO species_reports (scientific_name, kind, message, locale) VALUES ('A b', 'wrong', 'abcd', 'en')$q$,
    $q$INSERT INTO species_reports (scientific_name, kind, message, locale) VALUES ('A b', 'wrong', repeat('x', 2001), 'en')$q$,
    $q$INSERT INTO species_reports (scientific_name, kind, field, message, locale) VALUES ('A b', 'wrong', 'colour', 'Long enough', 'en')$q$,
    $q$INSERT INTO species_reports (scientific_name, kind, message, locale) VALUES ('A b', 'wrong', 'Long enough', 'fr')$q$,
    $q$INSERT INTO species_reports (scientific_name, kind, message, source, locale) VALUES ('A b', 'wrong', 'Long enough', '', 'en')$q$,
    $q$INSERT INTO species_reports (scientific_name, kind, message, source, locale) VALUES ('A b', 'wrong', 'Long enough', repeat('x', 501), 'en')$q$,
    $q$INSERT INTO species_reports (scientific_name, kind, message, locale) VALUES ('', 'wrong', 'Long enough', 'en')$q$
  ] LOOP
    BEGIN
      EXECUTE bad;
      RAISE EXCEPTION 'accepted: %', bad;
    EXCEPTION WHEN check_violation THEN NULL;
    END;
  END LOOP;
END $$;

-- An unknown kind is refused by the enum.
DO $$ BEGIN
  INSERT INTO species_reports (scientific_name, kind, message, locale) VALUES ('A b', 'bogus', 'Long enough', 'en');
  RAISE EXCEPTION 'accepted an unknown kind';
EXCEPTION WHEN invalid_text_representation THEN NULL;
END $$;

-- Removing the species keeps its reports, without the id.
DELETE FROM mushrooms WHERE id = 1;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM species_reports WHERE mushroom_id IS NULL) = 2, 'reports must survive the species';
END $$;

-- No policies: RLS is on.
DO $$ BEGIN
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE relname = 'species_reports'), 'RLS must be enabled';
END $$;

SELECT 'all migration checks passed' AS result;
```

- [ ] **Step 2: Run the test to verify it fails**

Start a throwaway Postgres container. Docker is installed:

```bash
docker run --rm -d --name reports-pg -e POSTGRES_PASSWORD=pg postgres:17
until docker exec reports-pg pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
T="<scratchpad>/species-reports-test"
cat "$T/stubs.sql" "$T/tests.sql" | docker exec -i reports-pg psql -U postgres -v ON_ERROR_STOP=1 -q
```

Expected: FAIL with `relation "species_reports" does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261009220000_add_species_reports.sql`:

```sql
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
```

- [ ] **Step 4: Run the test to verify it passes**

Reset the database, then run the stubs, the migration and the tests:

```bash
docker exec reports-pg psql -U postgres -q -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS auth CASCADE;"
cat "$T/stubs.sql" supabase/migrations/20261009220000_add_species_reports.sql "$T/tests.sql" \
  | docker exec -i reports-pg psql -U postgres -v ON_ERROR_STOP=1 -q
docker stop reports-pg
```

Expected: PASS, printing `all migration checks passed` with no `ERROR`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261009220000_add_species_reports.sql
git commit -m "Add a species_reports table for reports of missing or wrong information on a species page"
```

- [ ] **Step 6: Hand off applying the migration**

Don't apply the migration yourself. Ask the user to apply it to the remote project the way they apply the others, and wait for them to confirm. `supabase/migrations/20261006135530_add_provinces.sql` is untracked and may not be applied, so a blind `supabase db push` could push it too.

---

### Task 2: Report parsing for the edge function

**Files:**
- Create: `supabase/functions/report-issue/report.ts`
- Test: `supabase/functions/report-issue/report_test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `REPORT_FIELDS: readonly ReportField[]`, `type ReportField`
  - `interface Report { mushroomId: number | null; scientificName: string; kind: "missing" | "wrong"; field: ReportField | null; message: string; source: string | null; locale: "it" | "en" }`
  - `parseReport(body: unknown): Report | "spam" | undefined`
  - `clientIp(headers: Headers): string | null`
  - `hashIp(salt: string, ip: string): Promise<string>` (64 lowercase hex characters)

Deno isn't installed. Run it through npm with `npx --yes deno@2.9.6`, written as `deno` below.

- [ ] **Step 1: Write the failing tests**

Create `supabase/functions/report-issue/report_test.ts`:

```ts
import { assertEquals, assertMatch, assertNotEquals } from "jsr:@std/assert@1";
import { clientIp, hashIp, parseReport } from "./report.ts";

const valid = {
  mushroomId: 12,
  scientificName: " Amanita muscaria ",
  kind: "wrong",
  field: "cap",
  message: "  The cap is red, not blue.  ",
  source: " Funghi d'Italia, p. 12 ",
  locale: "en",
};

Deno.test("parses a full report, trimming its text", () => {
  assertEquals(parseReport(valid), {
    mushroomId: 12,
    scientificName: "Amanita muscaria",
    kind: "wrong",
    field: "cap",
    message: "The cap is red, not blue.",
    source: "Funghi d'Italia, p. 12",
    locale: "en",
  });
});

Deno.test("optional fields default to null", () => {
  const { mushroomId: _, field: __, source: ___, ...required } = valid;
  assertEquals(parseReport(required), {
    mushroomId: null,
    scientificName: "Amanita muscaria",
    kind: "wrong",
    field: null,
    message: "The cap is red, not blue.",
    source: null,
    locale: "en",
  });
});

Deno.test("a blank source becomes null", () => {
  assertEquals((parseReport({ ...valid, source: "   " }) as { source: string | null }).source, null);
});

Deno.test("a padded short message is trimmed, so the table's length check sees 2 characters", () => {
  assertEquals((parseReport({ ...valid, message: "   ab   " }) as { message: string }).message, "ab");
});

Deno.test("a filled-in honeypot is spam, even if the rest is malformed", () => {
  assertEquals(parseReport({ ...valid, website: "https://spam.example" }), "spam");
  assertEquals(parseReport({ website: "x" }), "spam");
});

Deno.test("an empty honeypot is ignored", () => {
  assertNotEquals(parseReport({ ...valid, website: "" }), "spam");
  assertNotEquals(parseReport({ ...valid, website: "" }), undefined);
});

Deno.test("rejects malformed reports", () => {
  for (const body of [
    null,
    "report",
    [],
    { ...valid, kind: "bogus" },
    { ...valid, kind: undefined },
    { ...valid, field: "colour" },
    { ...valid, locale: "fr" },
    { ...valid, mushroomId: "12" },
    { ...valid, mushroomId: 1.5 },
    { ...valid, scientificName: 3 },
    { ...valid, message: undefined },
    { ...valid, source: 42 },
  ]) {
    assertEquals(parseReport(body), undefined, JSON.stringify(body));
  }
});

Deno.test("the client IP is the first x-forwarded-for entry, trimmed", () => {
  assertEquals(clientIp(new Headers({ "x-forwarded-for": " 203.0.113.7 , 10.0.0.1" })), "203.0.113.7");
  assertEquals(clientIp(new Headers({ "x-forwarded-for": "2001:db8::1" })), "2001:db8::1");
});

Deno.test("no x-forwarded-for, or an empty one, means no IP", () => {
  assertEquals(clientIp(new Headers()), null);
  assertEquals(clientIp(new Headers({ "x-forwarded-for": " , 10.0.0.1" })), null);
});

Deno.test("IP hashes are hex SHA-256, stable, and depend on the salt", async () => {
  const hash = await hashIp("salt", "203.0.113.7");
  assertMatch(hash, /^[0-9a-f]{64}$/);
  assertEquals(await hashIp("salt", "203.0.113.7"), hash);
  assertNotEquals(await hashIp("other salt", "203.0.113.7"), hash);
  // sha256("salt203.0.113.7")
  assertEquals(hash, await sha256Hex("salt203.0.113.7"));
});

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx --yes deno@2.9.6 test supabase/functions/report-issue/`
Expected: FAIL with `Module not found ".../report-issue/report.ts"`.

- [ ] **Step 3: Write the implementation**

Create `supabase/functions/report-issue/report.ts`:

```ts
// What the report-issue edge function reads from a request, kept apart from the handler so it
// can be tested without a database: `deno test supabase/functions/report-issue/`.

/**
 * Parts of a species page a report can be about. The same list as the check on
 * species_reports.field and REPORT_FIELDS in frontend/src/data/reports.ts.
 */
export const REPORT_FIELDS = [
  "commonNameIt",
  "commonNameEn",
  "edibility",
  "toxicity",
  "cap",
  "hymenium",
  "lamella",
  "stipe",
  "gleba",
  "sporePrint",
  "ecology",
  "conservationStatus",
  "taxonomy",
  "photos",
  "other",
] as const;

export type ReportField = (typeof REPORT_FIELDS)[number];

export interface Report {
  mushroomId: number | null;
  scientificName: string;
  kind: "missing" | "wrong";
  /** Null for the species as a whole. */
  field: ReportField | null;
  message: string;
  source: string | null;
  locale: "it" | "en";
}

const isReportField = (v: unknown): v is ReportField => REPORT_FIELDS.includes(v as ReportField);

/**
 * The report in `body`, "spam" if the hidden `website` field was filled in, or undefined if it
 * is malformed. Text is trimmed; lengths are left to the table's checks.
 */
export function parseReport(body: unknown): Report | "spam" | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const { mushroomId, scientificName, kind, field, message, source, locale, website } = body as Record<
    string,
    unknown
  >;
  // People never see the field; only bots fill it in.
  if (typeof website === "string" && website.trim() !== "") return "spam";

  if (mushroomId !== undefined && mushroomId !== null && !Number.isInteger(mushroomId)) return undefined;
  if (typeof scientificName !== "string" || typeof message !== "string") return undefined;
  if (kind !== "missing" && kind !== "wrong") return undefined;
  if (locale !== "it" && locale !== "en") return undefined;
  if (field !== undefined && field !== null && !isReportField(field)) return undefined;
  if (source !== undefined && source !== null && typeof source !== "string") return undefined;

  return {
    mushroomId: (mushroomId as number | undefined) ?? null,
    scientificName: scientificName.trim(),
    kind,
    field: (field as ReportField | null | undefined) ?? null,
    message: message.trim(),
    source: (source as string | null | undefined)?.trim() || null,
    locale,
  };
}

/** The sender's IP: the first address in x-forwarded-for, which the Supabase gateway sets. */
export function clientIp(headers: Headers): string | null {
  const first = headers.get("x-forwarded-for")?.split(",")[0].trim();
  return first || null;
}

/** Hex SHA-256 of the salt and the IP: the same sender always gets the same hash, but it can't be reversed without the salt. */
export async function hashIp(salt: string, ip: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + ip));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx --yes deno@2.9.6 test supabase/functions/report-issue/`
Expected: PASS, `ok | 10 passed | 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/report-issue/report.ts supabase/functions/report-issue/report_test.ts
git commit -m "Parse species reports, the sender's IP and its salted hash for the report-issue edge function"
```

---

### Task 3: `report-issue` edge function handler

**Files:**
- Create: `supabase/functions/report-issue/index.ts`

**Interfaces:**
- Consumes: from Task 2, `parseReport`, `clientIp`, `hashIp` and `Report`; from Task 1, the `species_reports` table.
- Produces: the HTTP endpoint `POST /functions/v1/report-issue`. The request body is described in the header comment below. It answers 204, 400, 401, 405, 429 or 500.

- [ ] **Step 1: Write the handler**

Create `supabase/functions/report-issue/index.ts`:

```ts
// Stores a report of missing or wrong information on a species page in `species_reports`:
// anonymously when the request comes with the anon key, or with the user's id when it comes
// with a signed-in user's token. The table has no policies, so the browser writes through this
// function rather than the Data API.
//
// POST JSON: { mushroomId?, scientificName, kind: "missing" | "wrong", field?, message, source?,
// locale: "it" | "en", website? }. `website` is a field people never see: reports that fill it
// in are dropped with the same answer as stored ones, so bots don't notice. Each sender can send
// a limited number of reports per hour, counted by user id, or for anonymous senders by a
// salted hash of their IP: the IP itself is never stored.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import postgres from "npm:postgres@3.4.7";
import { clientIp, hashIp, parseReport, type Report } from "./report.ts";

// The app calls the function from the browser, on another origin.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { max: 1, prepare: false });

const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, ANON_KEY);

// Unsalted, the hashes of every IPv4 address could be computed and the IPs read back.
const IP_SALT = Deno.env.get("REPORT_IP_SALT");
if (!IP_SALT) throw new Error("REPORT_IP_SALT must be set");

/** Reports a sender can send per hour. */
const ANONYMOUS_LIMIT = 10;
const USER_LIMIT = 30;

/**
 * The id of the signed-in user who sent the request, null if it was sent with the anon key, or
 * undefined if the token doesn't verify (expired, or forged).
 */
async function requestUser(req: Request): Promise<string | null | undefined> {
  const token = req.headers.get("Authorization")?.replace(/^Bearer /, "");
  if (!token || token === ANON_KEY) return null;
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data) return undefined;
  return data.claims.role === "authenticated" ? data.claims.sub : null;
}

const badRequest = (error: string) => Response.json({ error }, { status: 400, headers: CORS_HEADERS });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { ...CORS_HEADERS, Allow: "POST, OPTIONS" },
    });
  }

  let report: Report | "spam" | undefined;
  try {
    report = parseReport(await req.json());
  } catch {
    // Not JSON.
  }
  if (!report) return badRequest("Expected a report as JSON");
  if (report === "spam") return new Response(null, { status: 204, headers: CORS_HEADERS });

  const userId = await requestUser(req);
  if (userId === undefined) {
    return Response.json({ error: "Invalid session" }, { status: 401, headers: CORS_HEADERS });
  }

  const ip = clientIp(req.headers);
  const ipHash = ip ? await hashIp(IP_SALT, ip) : null;
  // Signed-in users are counted by account, anyone else by IP.
  const sender = userId ? sql`user_id = ${userId}::uuid` : sql`ip_hash = ${ipHash}`;
  const limit = userId ? USER_LIMIT : ANONYMOUS_LIMIT;

  try {
    // A species removed from the dataset since the app cached it gets a null id: the name keeps
    // the report readable. Counting and inserting in one statement keeps the limit tight; a burst
    // of concurrent requests can still go a few reports over it.
    const inserted = await sql`
      INSERT INTO species_reports (mushroom_id, scientific_name, kind, field, message, source, locale,
                                   user_id, ip_hash)
      SELECT (SELECT id FROM mushrooms WHERE id = ${report.mushroomId}::integer),
             ${report.scientificName}, ${report.kind}::report_kind, ${report.field}, ${report.message},
             ${report.source}, ${report.locale}, ${userId}::uuid, ${ipHash}
      WHERE (SELECT count(*) FROM species_reports
             WHERE ${sender} AND created_at > now() - interval '1 hour') < ${limit}
      RETURNING id
    `;
    if (inserted.length === 0) {
      return Response.json({ error: "Too many reports" }, { status: 429, headers: CORS_HEADERS });
    }
  } catch (e) {
    // Check, foreign key and data format violations: the report itself is invalid.
    const code = (e as { code?: string }).code;
    if (code === "23514" || code === "23503" || code?.startsWith("22")) return badRequest("Invalid report");
    console.error("Insert failed:", e);
    return Response.json({ error: "Could not send the report" }, { status: 500, headers: CORS_HEADERS });
  }

  return new Response(null, { status: 204, headers: CORS_HEADERS });
});
```

- [ ] **Step 2: Type-check the function and rerun the unit tests**

Run:
```bash
npx --yes deno@2.9.6 check supabase/functions/report-issue/index.ts
npx --yes deno@2.9.6 test supabase/functions/report-issue/
```
Expected: `check` prints no errors. The tests pass with `10 passed`.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/report-issue/index.ts
git commit -m "Add a report-issue edge function that stores species reports from signed-in or anonymous visitors, dropping bots and limiting each sender to a few reports an hour"
```

- [ ] **Step 4: Deploy, with the user's go-ahead**

Ask the user before running anything in this step, and only continue once Task 1's migration is applied. Then:

1. Check how `share-find` is deployed, using the Supabase MCP `get_edge_function` with slug `share-find`. Deploy `report-issue` with the same `verify_jwt` setting. If it is `false`, add `--no-verify-jwt` to the deploy command.
2. Set the salt and deploy:
   ```bash
   supabase secrets set REPORT_IP_SALT="$(openssl rand -hex 32)"
   supabase functions deploy report-issue
   ```

- [ ] **Step 5: Verify the deployed function with curl**

```bash
set -a; . frontend/.env; set +a
URL="$VITE_SUPABASE_URL/functions/v1/report-issue"
post() {  # $1 = JSON body, $2 = token (defaults to the anon key)
  curl -s -o /dev/null -w "%{http_code}\n" -X POST "$URL" \
    -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer ${2:-$VITE_SUPABASE_ANON_KEY}" \
    -H "Content-Type: application/json" -d "$1"
}
BODY='"scientificName":"Amanita muscaria","kind":"wrong","field":"cap","locale":"en"'
post "{$BODY,\"mushroomId\":1,\"message\":\"Test report, please delete.\"}"          # 204
post "{$BODY,\"mushroomId\":999999999,\"message\":\"Test report, stale id.\"}"       # 204
post "{$BODY,\"message\":\"Test report, honeypot.\",\"website\":\"x\"}"               # 204, not stored
post "{$BODY,\"message\":\"   ab   \"}"                                               # 400
post '{"scientificName":"A b","kind":"bogus","message":"Test report","locale":"en"}' # 400
post 'not json'                                                                         # 400
post "{$BODY,\"message\":\"Test report, forged.\"}" "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.bad"  # 401
curl -s -o /dev/null -w "%{http_code}\n" "$URL" -H "apikey: $VITE_SUPABASE_ANON_KEY"     # 405
for i in $(seq 1 9); do post "{$BODY,\"message\":\"Test report, flood $i.\"}"; done      # 8× 204, then 429
```

Expected codes are in the comments. The first two reports plus 8 flood reports make 10 from this IP, so the 9th flood request is the 11th report and gets 429.

Then check the rows with the Supabase MCP `execute_sql`, which is read-only:

```sql
SELECT mushroom_id, field, message, user_id, ip_hash IS NOT NULL AS hashed, status
FROM species_reports WHERE message LIKE 'Test report%' ORDER BY created_at;
```

Expected: 10 rows. The stale-id row has `mushroom_id` null. No row says `honeypot`. Every row has `user_id` null, `hashed` true and `status` `open`.

- [ ] **Step 6: Clean up the test rows, with the user's go-ahead**

```sql
DELETE FROM species_reports WHERE message LIKE 'Test report%';
```

---

### Task 4: Frontend report client and strings

**Files:**
- Create: `frontend/src/data/reports.ts`
- Modify: `frontend/src/i18n/locales/en.ts` (after the `privacy.title` line, before `notFound.*`)
- Modify: `frontend/src/i18n/locales/it.ts` (same place)

**Interfaces:**
- Consumes: `supabase` from `frontend/src/data/supabase.ts`; `Locale` from `frontend/src/i18n/locales/index.ts`; the endpoint from Task 3.
- Produces:
  - `REPORT_FIELDS`, `type ReportField`, `type ReportKind = "missing" | "wrong"`
  - `MESSAGE_MIN = 5`, `MESSAGE_MAX = 2000`, `SOURCE_MAX = 500`
  - `interface Report { mushroomId: number; scientificName: string; kind: ReportKind; field: ReportField | null; message: string; source: string; locale: Locale; website: string }`
  - `type ReportError = "rateLimited" | "session" | "failed"`
  - `sendReport(report: Report): Promise<ReportError | null>`
  - message keys `report.*`, listed below

The frontend has no test framework. This task is checked with the type-checker and the linter, and the behaviour is exercised in Task 5.

- [ ] **Step 1: Write `reports.ts`**

```ts
import { FunctionsHttpError } from "@supabase/supabase-js"
import { supabase } from "./supabase"
import type { Locale } from "../i18n/locales"

/**
 * Parts of a species page a report can be about. The same list as the check on
 * species_reports.field and REPORT_FIELDS in supabase/functions/report-issue/report.ts.
 */
export const REPORT_FIELDS = [
  "commonNameIt",
  "commonNameEn",
  "edibility",
  "toxicity",
  "cap",
  "hymenium",
  "lamella",
  "stipe",
  "gleba",
  "sporePrint",
  "ecology",
  "conservationStatus",
  "taxonomy",
  "photos",
  "other",
] as const

export type ReportField = (typeof REPORT_FIELDS)[number]

export type ReportKind = "missing" | "wrong"

/** Lengths the species_reports table accepts, checked by the form before sending. */
export const MESSAGE_MIN = 5
export const MESSAGE_MAX = 2000
export const SOURCE_MAX = 500

export interface Report {
  mushroomId: number
  scientificName: string
  kind: ReportKind
  /** Null for the species as a whole. */
  field: ReportField | null
  message: string
  /** Where the right information comes from; '' when not given. */
  source: string
  locale: Locale
  /** The hidden field bots fill in; always '' when a person sends the form. */
  website: string
}

/** Why a report wasn't sent: too many in a short time, an expired session, or anything else. */
export type ReportError = "rateLimited" | "session" | "failed"

/** Supabase edge function that stores reports (supabase/functions/report-issue). */
const REPORT_FUNCTION = "report-issue"

/**
 * Sends the report. Supabase sends the session token when a user is signed in, and the edge
 * function saves their user id with it; the anon key otherwise. Resolves to null once stored.
 */
export async function sendReport(report: Report): Promise<ReportError | null> {
  const { error } = await supabase.functions.invoke(REPORT_FUNCTION, { body: report })
  if (!error) return null
  const status = error instanceof FunctionsHttpError ? (error.context as Response).status : undefined
  if (status === 429) return "rateLimited"
  if (status === 401) return "session"
  return "failed"
}
```

- [ ] **Step 2: Add the English strings**

In `frontend/src/i18n/locales/en.ts`, insert after `"privacy.title": "Privacy Policy",`:

```ts

  "report.open": "Report missing or wrong info",
  "report.title": "Report missing or wrong info",
  "report.intro": "Tell us what's missing or wrong on the page of {name}. Every report is checked by hand.",
  "report.kind": "What's the problem?",
  "report.kind.missing": "Something is missing",
  "report.kind.wrong": "Something is wrong",
  "report.field": "Which part of the page?",
  "report.field.whole": "The species as a whole",
  "report.field.commonNameIt": "Italian common names",
  "report.field.commonNameEn": "English common names",
  "report.field.edibility": "Edibility",
  "report.field.other": "Something else",
  "report.message": "Details",
  "report.messagePlaceholder.missing": "What's missing? For example: the spore print is white.",
  "report.messagePlaceholder.wrong": "What's wrong, and what's right? For example: the cap is red, not brown.",
  "report.messageCount": "{count} / {max}",
  "report.source": "Source",
  "report.sourcePlaceholder": "A book, a website, an identification key…",
  "report.signedIn": "Sent as {email}.",
  "report.anonymous": "Sent anonymously.",
  "report.signIn": "Sign in",
  "report.cancel": "Cancel",
  "report.submit": "Send report",
  "report.sent.title": "Thank you!",
  "report.sent.body": "We'll check your report and fix the page if needed.",
  "report.close": "Close",
  "report.error.rateLimited": "You've sent many reports in a short time. Try again later.",
  "report.error.session": "Your session has expired. Reload the page or sign in again.",
  "report.error.failed": "Couldn't send the report. Check your connection and try again.",
```

- [ ] **Step 3: Add the Italian strings**

In `frontend/src/i18n/locales/it.ts`, insert after `"privacy.title": "Informativa sulla privacy",`:

```ts

  "report.open": "Segnala informazioni mancanti o errate",
  "report.title": "Segnala informazioni mancanti o errate",
  "report.intro": "Dicci cosa manca o è sbagliato nella pagina di {name}. Ogni segnalazione viene controllata a mano.",
  "report.kind": "Qual è il problema?",
  "report.kind.missing": "Manca qualcosa",
  "report.kind.wrong": "Qualcosa è sbagliato",
  "report.field": "Quale parte della pagina?",
  "report.field.whole": "La specie in generale",
  "report.field.commonNameIt": "Nomi comuni in italiano",
  "report.field.commonNameEn": "Nomi comuni in inglese",
  "report.field.edibility": "Commestibilità",
  "report.field.other": "Altro",
  "report.message": "Dettagli",
  "report.messagePlaceholder.missing": "Cosa manca? Ad esempio: la sporata è bianca.",
  "report.messagePlaceholder.wrong": "Cosa è sbagliato, e qual è il dato giusto? Ad esempio: il cappello è rosso, non marrone.",
  "report.messageCount": "{count} / {max}",
  "report.source": "Fonte",
  "report.sourcePlaceholder": "Un libro, un sito, una chiave di identificazione…",
  "report.signedIn": "Inviata come {email}.",
  "report.anonymous": "Inviata in forma anonima.",
  "report.signIn": "Accedi",
  "report.cancel": "Annulla",
  "report.submit": "Invia segnalazione",
  "report.sent.title": "Grazie!",
  "report.sent.body": "Controlleremo la tua segnalazione e, se serve, correggeremo la pagina.",
  "report.close": "Chiudi",
  "report.error.rateLimited": "Hai inviato molte segnalazioni in poco tempo. Riprova più tardi.",
  "report.error.session": "La tua sessione è scaduta. Ricarica la pagina o accedi di nuovo.",
  "report.error.failed": "Impossibile inviare la segnalazione. Controlla la connessione e riprova.",
```

- [ ] **Step 4: Type-check and lint**

Run (in `frontend/`): `npm run build && npm run lint`
Expected: both succeed with no errors. `reports.ts` isn't imported yet, but `tsc -b` still checks it.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/data/reports.ts frontend/src/i18n/locales/en.ts frontend/src/i18n/locales/it.ts
git commit -m "Send species reports to the report-issue edge function, with their texts in English and Italian"
```

---

### Task 5: Report dialog on the species page

**Files:**
- Create: `frontend/src/components/ReportIssueDialog.tsx`
- Modify: `frontend/src/pages/MushroomDetailPage.tsx` (imports at lines 1–4, the right-hand `Stack` around lines 112–116, plus a new `ReportIssue` component after `LearnMore`)

**Interfaces:**
- Consumes: everything Task 4 produces; `useAuth()` from `frontend/src/hooks/useAuth.tsx`, which returns `{ user: User | null }`; `useI18n()`, which returns `{ t, locale }`; `scientificName(m)` and `Mushroom` from `frontend/src/data/mushrooms.ts`.
- Produces: `ReportIssueDialog({ mushroom, open, onClose }: { mushroom: Mushroom; open: boolean; onClose: () => void })`.

Chakra UI v3 is in use. If a prop or part name below fails type-checking, look up the component with the chakra-ui MCP (`get_component_example` / `get_component_props` for `RadioCard`, `NativeSelect`, `Dialog`) and adjust to the installed version, keeping the behaviour.

- [ ] **Step 1: Write the dialog**

Create `frontend/src/components/ReportIssueDialog.tsx`:

```tsx
import { useId, useState, type FormEvent } from "react"
import {
  Box,
  Button,
  Dialog,
  Field,
  Flex,
  HStack,
  Input,
  Link,
  NativeSelect,
  Portal,
  RadioCard,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react"
import { Link as RouterLink } from "react-router"
import { CircleCheck, Flag } from "lucide-react"
import { scientificName, type Mushroom } from "../data/mushrooms"
import {
  MESSAGE_MAX,
  MESSAGE_MIN,
  REPORT_FIELDS,
  SOURCE_MAX,
  sendReport,
  type ReportError,
  type ReportField,
  type ReportKind,
} from "../data/reports"
import { useAuth } from "../hooks/useAuth"
import { useI18n } from "../i18n/I18nProvider"
import type { MessageKey } from "../i18n/locales/en"

/** Labels of the fields, reusing the ones the species page shows where there is one. */
const FIELD_LABELS: Record<ReportField, MessageKey> = {
  commonNameIt: "report.field.commonNameIt",
  commonNameEn: "report.field.commonNameEn",
  edibility: "report.field.edibility",
  toxicity: "detail.toxicityEffect",
  cap: "field.cap",
  hymenium: "field.hymenium",
  lamella: "field.lamella",
  stipe: "field.stipe",
  gleba: "field.gleba",
  sporePrint: "field.sporePrint",
  ecology: "field.ecology",
  conservationStatus: "field.conservationStatus",
  taxonomy: "detail.classification",
  photos: "detail.photos",
  other: "report.field.other",
}

const KINDS: ReportKind[] = ["missing", "wrong"]

interface Props {
  mushroom: Mushroom
  open: boolean
  onClose: () => void
}

/** Lets anyone report missing or wrong information on a species page, signed in or not. */
export function ReportIssueDialog({ mushroom, open, onClose }: Props) {
  return (
    // Unmounting on close resets the form for the next report.
    <Dialog.Root
      open={open}
      onOpenChange={(e) => !e.open && onClose()}
      placement="center"
      size="md"
      lazyMount
      unmountOnExit
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content borderRadius="3xl" mx="4">
            <ReportForm mushroom={mushroom} onClose={onClose} />
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}

function ReportForm({ mushroom, onClose }: Omit<Props, "open">) {
  const { t, locale } = useI18n()
  const { user } = useAuth()
  const formId = useId()
  const [kind, setKind] = useState<ReportKind | null>(null)
  const [field, setField] = useState<ReportField | "">("")
  const [message, setMessage] = useState("")
  const [source, setSource] = useState("")
  const [website, setWebsite] = useState("")
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<ReportError | null>(null)

  const name = scientificName(mushroom)
  const valid = kind !== null && message.trim().length >= MESSAGE_MIN

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (kind === null || !valid || sending) return
    setSending(true)
    setError(null)
    const result = await sendReport({
      mushroomId: mushroom.id,
      scientificName: name,
      kind,
      field: field || null,
      message: message.trim(),
      source: source.trim(),
      locale,
      website,
    })
    setSending(false)
    if (result) setError(result)
    else setSent(true)
  }

  if (sent) {
    return (
      <>
        <Dialog.Body pt="8">
          <Stack align="center" textAlign="center" gap="3">
            <Box color="moss.fg">
              <CircleCheck size={40} aria-hidden />
            </Box>
            <Dialog.Title fontFamily="heading" fontSize="xl" fontWeight="800">
              {t("report.sent.title")}
            </Dialog.Title>
            <Dialog.Description>{t("report.sent.body")}</Dialog.Description>
          </Stack>
        </Dialog.Body>
        <Dialog.Footer>
          <Button borderRadius="full" colorPalette="moss" w="full" onClick={onClose}>
            {t("report.close")}
          </Button>
        </Dialog.Footer>
      </>
    )
  }

  return (
    <>
      <Dialog.Header>
        <Flex align="center" gap="3">
          <Box flexShrink={0} p="2" borderRadius="full" bg="moss.solid" color="moss.contrast">
            <Flag size={22} aria-hidden />
          </Box>
          <Dialog.Title fontFamily="heading" fontSize="xl" fontWeight="800" letterSpacing="-0.02em">
            {t("report.title")}
          </Dialog.Title>
        </Flex>
      </Dialog.Header>

      <Dialog.Body>
        <Dialog.Description>{t("report.intro", { name })}</Dialog.Description>
        <Stack as="form" id={formId} onSubmit={submit} gap="4" mt="4" position="relative">
          <RadioCard.Root
            value={kind}
            onValueChange={(e) => e.value && setKind(e.value as ReportKind)}
            colorPalette="moss"
            size="sm"
          >
            <RadioCard.Label>{t("report.kind")}</RadioCard.Label>
            <HStack align="stretch">
              {KINDS.map((k) => (
                <RadioCard.Item key={k} value={k} flex="1">
                  <RadioCard.ItemHiddenInput />
                  <RadioCard.ItemControl>
                    <RadioCard.ItemText>{t(`report.kind.${k}`)}</RadioCard.ItemText>
                    <RadioCard.ItemIndicator />
                  </RadioCard.ItemControl>
                </RadioCard.Item>
              ))}
            </HStack>
          </RadioCard.Root>

          <Field.Root>
            <Field.Label>{t("report.field")}</Field.Label>
            <NativeSelect.Root size={{ base: "lg", md: "md" }}>
              <NativeSelect.Field value={field} onChange={(e) => setField(e.currentTarget.value as ReportField | "")}>
                <option value="">{t("report.field.whole")}</option>
                {REPORT_FIELDS.map((f) => (
                  <option key={f} value={f}>
                    {t(FIELD_LABELS[f])}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Field.Root>

          <Field.Root required>
            <Field.Label>
              {t("report.message")} <Field.RequiredIndicator />
            </Field.Label>
            <Textarea
              size={{ base: "lg", md: "md" }}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t(kind === "missing" ? "report.messagePlaceholder.missing" : "report.messagePlaceholder.wrong")}
              maxLength={MESSAGE_MAX}
              rows={4}
            />
            <Field.HelperText alignSelf="flex-end">
              {t("report.messageCount", { count: message.length, max: MESSAGE_MAX })}
            </Field.HelperText>
          </Field.Root>

          <Field.Root>
            <Field.Label>{t("report.source")}</Field.Label>
            <Input
              size={{ base: "lg", md: "md" }}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder={t("report.sourcePlaceholder")}
              maxLength={SOURCE_MAX}
              autoComplete="off"
            />
          </Field.Root>

          {/* Hidden from people and screen readers: only bots fill it in, and their reports are dropped. */}
          <Box position="absolute" left="-10000px" top="0" w="1px" h="1px" overflow="hidden" aria-hidden>
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </Box>

          <Text fontSize="sm" color="fg.muted">
            {user ? (
              t("report.signedIn", { email: user.email ?? "" })
            ) : (
              <>
                {t("report.anonymous")}{" "}
                <Link asChild color="moss.fg" fontWeight="600">
                  <RouterLink to="/login" onClick={onClose}>
                    {t("report.signIn")}
                  </RouterLink>
                </Link>
              </>
            )}
          </Text>

          {error && (
            <Text role="alert" fontSize="sm" color="amanita.fg">
              {t(`report.error.${error}`)}
            </Text>
          )}
        </Stack>
      </Dialog.Body>

      <Dialog.Footer flexDirection={{ base: "column-reverse", sm: "row" }} alignItems="stretch" gap="3">
        <Button borderRadius="full" variant="outline" onClick={onClose}>
          {t("report.cancel")}
        </Button>
        <Button
          type="submit"
          form={formId}
          borderRadius="full"
          colorPalette="moss"
          fontWeight="700"
          disabled={!valid}
          loading={sending}
        >
          {t("report.submit")}
        </Button>
      </Dialog.Footer>
    </>
  )
}
```

Notes for the implementer:
- `t(\`report.kind.${k}\`)` and `t(\`report.error.${error}\`)` type-check because the template literal types resolve to existing `MessageKey`s. If `tsc` rejects them, map to keys explicitly with a `Record<ReportKind, MessageKey>`.
- `amanita` is the palette `PoisonWarning` uses on the detail page. Check that `amanita.fg` exists in `frontend/src/theme.ts`. If it doesn't, use `fg.error`.

- [ ] **Step 2: Add the button to the species page**

In `frontend/src/pages/MushroomDetailPage.tsx`:

1. Line 1: `import { useEffect, useMemo, useState, type ReactNode } from "react"`.
2. Line 4: add `Flag` to the lucide-react import.
3. After the existing component imports, add `import { ReportIssueDialog } from "../components/ReportIssueDialog"`.
4. In the right-hand column, add `<ReportIssue mushroom={mushroom} />` after `<LearnMore mushroom={mushroom} />`:
   ```tsx
        <Stack gap="6">
          <Classification mushroom={mushroom} />
          <Sightings mushroom={mushroom} />
          <LearnMore mushroom={mushroom} />
          <ReportIssue mushroom={mushroom} />
        </Stack>
   ```
5. After the `LearnMore` function, add:
   ```tsx
   /** Opens the form to report missing or wrong information on this page. */
   function ReportIssue({ mushroom }: { mushroom: Mushroom }) {
     const { t } = useI18n()
     const [open, setOpen] = useState(false)
     return (
       <>
         <Button variant="outline" borderRadius="full" size="sm" alignSelf="flex-start" onClick={() => setOpen(true)}>
           <Flag size={16} aria-hidden />
           {t("report.open")}
         </Button>
         <ReportIssueDialog mushroom={mushroom} open={open} onClose={() => setOpen(false)} />
       </>
     )
   }
   ```

- [ ] **Step 3: Type-check and lint**

Run (in `frontend/`): `npm run build && npm run lint`
Expected: both succeed with no errors.

- [ ] **Step 4: Check it manually in the app**

This needs Task 3 deployed. Run `npm run dev` in `frontend/`, open a species page at phone width (375px) and check:
1. Signed out: the button opens the dialog. Send stays disabled until a kind is picked and the message has at least 5 non-space characters. The identity line says "Sent anonymously. Sign in", and the link goes to `/login` with the dialog closed.
2. Send a report. The thank-you screen appears. Reopen the dialog: the form is empty again.
3. Double-tap Send on a fresh report. The button shows a spinner and only one row is added. Check with `execute_sql`: `SELECT count(*) FROM species_reports WHERE message = '<your message>'` → 1.
4. Signed in: the identity line shows your email. The stored row has your `user_id`.
5. Expired session: while signed in, open the dialog. In DevTools, edit the `sb-…-auth-token` entry in localStorage so `access_token` is invalid, then send. Expected: "Your session has expired…".
6. Switch to Italian. All texts are translated and the stored `locale` is `it`.
7. Offline (DevTools → Network → Offline): sending shows "Couldn't send the report…". The form keeps its content.
8. No horizontal scroll at 375px. Kind cards, select and buttons fit.

Then delete the test rows, with the user's go-ahead:
```sql
DELETE FROM species_reports WHERE message LIKE '<your test messages>%';
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ReportIssueDialog.tsx frontend/src/pages/MushroomDetailPage.tsx
git commit -m "Let visitors report missing or wrong information from a species page, signed in or anonymously"
```
