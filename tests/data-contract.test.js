import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createEnvelope, deserializeEnvelope, serializeEnvelope } from "../src/core/data-contract.js";
import { NamespaceRegistry } from "../src/core/namespace-registry.js";
import { INITIAL_NAMESPACE_DEFINITIONS } from "../src/system/system-namespace-definitions.js";

const DEVICE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ENVELOPE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const GENERATED_AT = "2026-07-12T12:00:00.000Z";

test("creates the minimal My English envelope with three initial namespaces", () => {
  const registry = new NamespaceRegistry(INITIAL_NAMESPACE_DEFINITIONS);
  const envelope = createEnvelope({
    deviceId: DEVICE_ID,
    envelopeId: ENVELOPE_ID,
    generatedAt: GENERATED_AT,
    registry
  });

  assert.equal(envelope.format, "bonnie-os-data");
  assert.equal(envelope.formatVersion, 1);
  assert.deepEqual(Object.keys(envelope.namespaces), [
    "system.settings",
    "system.metadata",
    "tools.my-english"
  ]);
});

test("preserves previously created system namespaces during serialization round-trip", async () => {
  const fixture = await readFixture("valid-envelope.json");
  fixture.namespaces["system.sync"] = { schemaVersion: 1, syncPolicy: "local-only", updatedAt: null, data: { paused: true } };
  fixture.namespaces["system.devices"] = { schemaVersion: 1, syncPolicy: "shared", updatedAt: null, data: { existing: true } };
  fixture.namespaces["system.user"] = { schemaVersion: 1, syncPolicy: "shared", updatedAt: null, data: { existing: true } };
  const restored = deserializeEnvelope(serializeEnvelope(fixture));
  assert.deepEqual(restored.namespaces["system.sync"], fixture.namespaces["system.sync"]);
  assert.deepEqual(restored.namespaces["system.devices"], fixture.namespaces["system.devices"]);
  assert.deepEqual(restored.namespaces["system.user"], fixture.namespaces["system.user"]);
});

test("preserves an unknown valid namespace during serialization round-trip", async () => {
  const fixture = await readFixture("unknown-tool-namespace.json");
  const restored = deserializeEnvelope(serializeEnvelope(fixture));
  assert.deepEqual(restored.namespaces["tools.future-tool"], fixture.namespaces["tools.future-tool"]);
});

test("does not mutate an envelope while serializing", async () => {
  const fixture = await readFixture("valid-envelope.json");
  const before = structuredClone(fixture);
  serializeEnvelope(fixture);
  assert.deepEqual(fixture, before);
});

async function readFixture(name) {
  return JSON.parse(await readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
}
