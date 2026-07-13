import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateEnvelope } from "../src/core/data-validator.js";
import { deserializeEnvelope } from "../src/core/data-contract.js";
import { DataContractError } from "../src/core/errors.js";

test("accepts a valid contract fixture", async () => {
  const fixture = await readFixture("valid-envelope.json");
  assert.deepEqual(validateEnvelope(fixture), { valid: true, errors: [] });
});

test("reports structural, identifier, date and credential errors", async () => {
  const fixture = await readFixture("invalid-envelope.json");
  const result = validateEnvelope(fixture);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.includes("Unsupported data format")));
  assert.ok(result.errors.some(error => error.includes("envelopeId must be a UUID")));
  assert.ok(result.errors.some(error => error.includes("Invalid namespace name")));
  assert.ok(result.errors.some(error => error.includes("Credential field is forbidden")));
});

test("rejects malformed JSON with a contract error", () => {
  assert.throws(() => deserializeEnvelope("{not json}"), DataContractError);
});

test("rejects a namespace whose value is not a plain object", async () => {
  const fixture = await readFixture("valid-envelope.json");
  fixture.namespaces["tools.future-tool"] = [];
  const result = validateEnvelope(fixture);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("Namespace must be a plain object: tools.future-tool"));
});

test("rejects circular data without throwing an uncontrolled exception", async () => {
  const fixture = await readFixture("valid-envelope.json");
  fixture.namespaces["system.settings"].data.circular = fixture;
  const result = validateEnvelope(fixture);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.includes("Circular data is not supported")));
});

async function readFixture(name) {
  return JSON.parse(await readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
}
