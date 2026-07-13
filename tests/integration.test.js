import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DEFAULT_STORAGE_KEYS } from "../src/adapters/storage/local-storage-adapter.js";
import { IntegrationError } from "../src/core/errors.js";
import { checksum } from "../src/shared/checksum.js";
import { LEGACY_STORAGE_KEYS } from "../src/tools/my-english/my-english-migrations.js";
import { MyEnglishIntegration } from "../src/integration/my-english-integration.js";

const NOW = "2026-07-12T18:00:00.000Z";

test("migrates v1.2 only after creating recovery data and keeps every legacy key", async () => {
  const fixture = await readFixture();
  const storage = createMemoryStorage(fixture.storageSnapshot);
  const before = storage.snapshot();
  const integration = createIntegration(storage);
  const result = await integration.initialize();

  assert.equal(result.migrated, true);
  assert.ok(storage.getItem(DEFAULT_STORAGE_KEYS.recoveryBackup));
  assert.ok(storage.getItem(DEFAULT_STORAGE_KEYS.envelope));
  for (const key of Object.values(LEGACY_STORAGE_KEYS)) assert.equal(storage.getItem(key), before[key] ?? null);

  const state = await result.repository.loadState();
  assert.equal(Object.keys(state.records).length, 3);
  assert.equal(Object.values(state.records).filter(record => record.isDeleted).length, 1);
});

test("verifies the persisted envelope and stores completion metadata", async () => {
  const fixture = await readFixture();
  const storage = createMemoryStorage(fixture.storageSnapshot);
  const result = await createIntegration(storage).initialize();
  const envelope = JSON.parse(storage.getItem(DEFAULT_STORAGE_KEYS.envelope));
  const metadata = JSON.parse(storage.getItem(DEFAULT_STORAGE_KEYS.localMetadata));
  assert.equal(metadata.migration.completedAt, NOW);
  assert.equal(metadata.migration.checksum, checksum(envelope));
  assert.equal(result.envelope.format, "bonnie-os-data");
});

test("does not rerun migration or replace recovery backup after integration", async () => {
  const fixture = await readFixture();
  const storage = createMemoryStorage(fixture.storageSnapshot);
  await createIntegration(storage).initialize();
  const backup = storage.getItem(DEFAULT_STORAGE_KEYS.recoveryBackup);
  const second = await createIntegration(storage).initialize();
  assert.equal(second.migrated, false);
  assert.equal(storage.getItem(DEFAULT_STORAGE_KEYS.recoveryBackup), backup);
});

test("leaves legacy keys untouched and creates no envelope when migration fails", async () => {
  const fixture = await readFixture();
  const corrupt = { ...fixture.storageSnapshot, [LEGACY_STORAGE_KEYS.records]: "{corrupt" };
  const storage = createMemoryStorage(corrupt);
  await assert.rejects(() => createIntegration(storage).initialize());
  assert.equal(storage.getItem(DEFAULT_STORAGE_KEYS.envelope), null);
  assert.ok(storage.getItem(DEFAULT_STORAGE_KEYS.recoveryBackup));
  assert.equal(storage.getItem(LEGACY_STORAGE_KEYS.records), "{corrupt");
});

test("supports a new installation with no v1.2 data", async () => {
  const storage = createMemoryStorage();
  const result = await createIntegration(storage).initialize();
  assert.equal(result.migrated, true);
  assert.deepEqual((await result.repository.loadState()).records, {});
});

test("rejects missing storage dependencies", () => {
  assert.throws(() => new MyEnglishIntegration({ storage: null }), IntegrationError);
});

function createIntegration(storage) {
  const ids = ["77777777-7777-4777-8777-777777777777", "88888888-8888-4888-8888-888888888888"];
  return new MyEnglishIntegration({
    storage,
    clock: () => NOW,
    cryptoApi: { randomUUID: () => ids.shift() }
  });
}

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial).filter(([, value]) => value !== null).map(([key, value]) => [key, String(value)]));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(key); },
    snapshot() { return Object.fromEntries(values); }
  };
}

async function readFixture() {
  return JSON.parse(await readFile(new URL("./fixtures/v1.2-local-storage.json", import.meta.url), "utf8"));
}
