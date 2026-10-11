import { assertEquals } from "jsr:@std/assert@1";
import { isAnonKey } from "./anon_key.ts";

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
