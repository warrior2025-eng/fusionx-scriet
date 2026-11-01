// Run with: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { linkField, linkHref, normalizeLink } from "./link.ts";

const fixed = [
  ["linkedin.com/in/riya", "linkedin", "https://www.linkedin.com/in/riya"],
  ["www.linkedin.com/in/riya/", "linkedin", "https://www.linkedin.com/in/riya"],
  ["m.linkedin.com/in/riya", "linkedin", "https://www.linkedin.com/in/riya"],
  ["in.linkedin.com/in/riya", "linkedin", "https://www.linkedin.com/in/riya"],
  ["riya-sharma", "linkedin", "https://www.linkedin.com/in/riya-sharma"],
  ["@riya-sharma", "linkedin", "https://www.linkedin.com/in/riya-sharma"],
  ["in/riya-sharma", "linkedin", "https://www.linkedin.com/in/riya-sharma"],
  ["company/fxscriet", "linkedin", "https://www.linkedin.com/company/fxscriet"],
  ["@riya", "github", "https://github.com/riya"],
  ["riya", "github", "https://github.com/riya"],
  ["riya/repo", "github", "https://github.com/riya/repo"],
  ["github.com/riya/repo?utm_source=x", "github", "https://github.com/riya/repo"],
  ["http://github.com/riya", "github", "https://github.com/riya"],
  ["@fx.scriet", "instagram", "https://www.instagram.com/fx.scriet"],
  ["fx.scriet", "instagram", "https://www.instagram.com/fx.scriet"],
  ["instagram.com/fx.scriet?igsh=abc", "instagram", "https://www.instagram.com/fx.scriet"],
  ["@fxscriet", "twitter_x", "https://x.com/fxscriet"],
  ["twitter.com/fxscriet", "twitter_x", "https://x.com/fxscriet"],
  ["@handle", "youtube", "https://www.youtube.com/@handle"],
  ["youtube.com/watch?v=abc&si=xyz", "youtube", "https://www.youtube.com/watch?v=abc"],
  ["riya", "behance", "https://www.behance.net/riya"],
  ["@riya", "dribbble", "https://dribbble.com/riya"],
  ["figma.com/file/abc", "figma", "https://www.figma.com/file/abc"],
  ["drive.google.com/file/d/abc", "drive", "https://drive.google.com/file/d/abc"],
  ["chat.whatsapp.com/AbCdEf", "whatsapp_group", "https://chat.whatsapp.com/AbCdEf"],
  ["abc-defg-hij", "meet", "https://meet.google.com/abc-defg-hij"],
  ["meet.google.com/abc-defg-hij?authuser=0", "meet", "https://meet.google.com/abc-defg-hij"],
  ["riya.dev", "website", "https://riya.dev"],
  ["https//riya.dev", "website", "https://riya.dev"],
  ["https:/riya.dev", "website", "https://riya.dev"],
  ["http:/riya.dev", "website", "https://riya.dev"],
  ["https://https://riya.dev", "website", "https://riya.dev"],
  ["Https://riya.dev", "website", "https://riya.dev"],
  ["HTTP://Riya.DEV/Work", "website", "https://riya.dev/Work"],
  [" riya.dev. ", "website", "https://riya.dev"],
  ["\"riya.dev\",", "website", "https://riya.dev"],
  ["<riya.dev>", "website", "https://riya.dev"],
  ["riya.dev /work", "website", "https://riya.dev/work"],
  ["ri​ya.dev\n", "website", "https://riya.dev"],
  ["https:\\\\riya.dev\\work", "website", "https://riya.dev/work"],
  ["www.x.com", "any", "https://x.com"],
  ["x.com/abc", "any", "https://x.com/abc"],
  ["example.com/a?id=7&utm_medium=mail&fbclid=1", "any", "https://example.com/a?id=7"],
  ["example.com:8080/a", "any", "https://example.com:8080/a"],
];

for (const [input, kind, output] of fixed) {
  test(`${JSON.stringify(input)} as ${kind} becomes ${output}`, () => {
    const result = normalizeLink(input, kind);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.value, output);
  });
}

const refused = [
  ["abc xyz", "website"],
  ["abc xyz", "linkedin"],
  ["javascript:alert(1)", "website"],
  ["javascript:alert(1)", "linkedin"],
  ["JaVa\nScript:alert(1)", "any"],
  ["https://javascript:alert(1)", "any"],
  ["data:text/html,hi", "any"],
  ["file:///etc/passwd", "any"],
  ["vbscript:x", "any"],
  ["lonely", "website"],
  ["lonely", "any"],
  ["https://google.com@evil.com", "any"],
  ["riya@gmail.com", "website"],
  ["mailto:riya@gmail.com", "website"],
  ["/events", "website"],
  ["http://localhost", "any"],
];

for (const [input, kind] of refused) {
  test(`${JSON.stringify(input)} as ${kind} is an error`, () => {
    const result = normalizeLink(input, kind, { label: "Portfolio" });
    assert.equal(result.ok, false);
    assert.match(result.error, /^Portfolio doesn't look like a link\. Example: /);
  });
}

test("empty stays empty", () => {
  assert.deepEqual(normalizeLink("   ", "linkedin"), { ok: true, value: "" });
  assert.deepEqual(normalizeLink(null, "any"), { ok: true, value: "" });
});

test("a link from another site is kept, with a hint", () => {
  const result = normalizeLink("github.com/riya", "linkedin");
  assert.equal(result.value, "https://github.com/riya");
  assert.equal(result.hint, "This looks like a GitHub link. Is that right?");
});

test("a link from an unknown site in a specific field gets a hint too", () => {
  const result = normalizeLink("riya.dev", "instagram");
  assert.equal(result.value, "https://riya.dev");
  assert.match(result.hint, /doesn't look like a Instagram link/);
});

test("the right site has no hint", () => {
  assert.equal(normalizeLink("github.com/riya", "github").hint, undefined);
});

test("a path only where the field allows one", () => {
  assert.equal(normalizeLink("/events", "any", { allowPath: true }).value, "/events");
  assert.equal(normalizeLink("//evil.com", "any", { allowPath: true }).value, "https://evil.com");
  assert.equal(normalizeLink("/events", "any").ok, false);
});

test("mailto only on a contact link", () => {
  assert.equal(normalizeLink("mailto:Riya@x.com", "any", { allowMailto: true }).value, "mailto:Riya@x.com");
  assert.equal(normalizeLink("riya@x.com", "any", { allowMailto: true }).value, "mailto:riya@x.com");
  assert.equal(normalizeLink("mailto:riya@x.com", "any").ok, false);
});

test("a second pass changes nothing", () => {
  for (const [input, kind, output] of fixed) {
    assert.equal(normalizeLink(output, kind).value, output, `${input} as ${kind}`);
  }
});

test("linkField gives the fixed link or the message", () => {
  const field = linkField("LinkedIn", "linkedin");
  assert.equal(field.parse("riya-sharma"), "https://www.linkedin.com/in/riya-sharma");
  assert.equal(field.parse(""), "");
  assert.match(field.safeParse("abc xyz").error.issues[0].message, /^LinkedIn doesn't look like a link/);
  assert.match(linkField("Link", "any", { required: true }).safeParse("").error.issues[0].message, /^Link is required/);
  assert.match(linkField("Link", "any", { max: 10 }).safeParse("example.com/long/path").error.issues[0].message, /max 10/);
});

test("linkHref fixes older links and drops unsafe ones", () => {
  assert.equal(linkHref("http://www.linkedin.com/in/riya/", "linkedin"), "https://www.linkedin.com/in/riya");
  assert.equal(linkHref("javascript:alert(1)"), null);
  assert.equal(linkHref(""), null);
  assert.equal(linkHref("/events", "any", { allowPath: true }), "/events");
});
