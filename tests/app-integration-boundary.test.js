import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("app uses Integration and has no direct Local Storage operations", async () => {
  const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
  assert.match(source, /createMyEnglishIntegration/);
  assert.doesNotMatch(source, /\.getItem\(|\.setItem\(|\.removeItem\(/);
  assert.doesNotMatch(source, /my_english_pages_records_v1|my_english_pages_current_v1/);
});

test("Integration is the only runtime module that reads legacy keys", async () => {
  const source = await readFile(new URL("../src/integration/my-english-integration.js", import.meta.url), "utf8");
  assert.match(source, /LEGACY_STORAGE_KEYS/);
  assert.match(source, /getItem/);
});
