import { assertEquals, assertMatch, assertNotEquals } from "jsr:@std/assert@1";
import { clientIp, hashIp, isAnonKey, parseReport, senderIpHash, UNKNOWN_IP } from "./report.ts";

/** An unsigned JWT with these claims: enough for code that only reads the payload. */
const jwt = (claims: Record<string, unknown>) =>
  [{ alg: "HS256", typ: "JWT" }, claims].map((part) => btoa(JSON.stringify(part)).replace(/=+$/, "")).join(".") +
  ".signature";

Deno.test("the anon key is recognized by its role, whatever value the function's env holds", () => {
  assertEquals(isAnonKey(jwt({ iss: "supabase", ref: "abc", role: "anon" })), true);
});

Deno.test("user tokens, other keys and garbage are not the anon key", () => {
  assertEquals(isAnonKey(jwt({ role: "authenticated", sub: "u1" })), false);
  assertEquals(isAnonKey(jwt({ role: "service_role" })), false);
  assertEquals(isAnonKey("not-a-jwt"), false);
  assertEquals(isAnonKey("a.%%%.c"), false);
});

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

Deno.test("cf-connecting-ip, set by Cloudflare, wins over a forged x-forwarded-for", () => {
  const headers = new Headers({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "6.6.6.6, 203.0.113.7" });
  assertEquals(clientIp(headers), "203.0.113.7");
  assertEquals(clientIp(new Headers({ "cf-connecting-ip": " ", "x-forwarded-for": "203.0.113.7" })), "203.0.113.7");
});

Deno.test("senders without a usable IP share one bucket instead of escaping the limit", async () => {
  assertEquals(await senderIpHash("salt", new Headers()), UNKNOWN_IP);
  assertEquals(await senderIpHash("salt", new Headers({ "x-forwarded-for": " , 10.0.0.1" })), UNKNOWN_IP);
  assertEquals(
    await senderIpHash("salt", new Headers({ "x-forwarded-for": "203.0.113.7" })),
    await hashIp("salt", "203.0.113.7"),
  );
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
