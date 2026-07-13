import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  DEFAULT_STORAGE_KEYS,
  LocalStorageAdapter
} from "../src/adapters/storage/local-storage-adapter.js";
import { StorageAdapter } from "../src/core/storage-adapter.js";
import { StorageAdapterError } from "../src/core/errors.js";

test("implements StorageAdapter without using a browser global", async () => {
  const storage = createMemoryStorage();
  const adapter = new LocalStorageAdapter({ storage });
  assert.equal(adapter instanceof StorageAdapter, true);
  await adapter.initialize();
  assert.equal(await adapter.loadEnvelope(), null);
});

test("round-trips a validated Bonnie OS envelope", async () => {
  const storage = createMemoryStorage();
  const adapter = new LocalStorageAdapter({ storage });
  const envelope = await readFixture("valid-envelope.json");
  await adapter.initialize();
  await adapter.saveEnvelope(envelope);
  assert.deepEqual(await adapter.loadEnvelope(), envelope);
  assert.equal(typeof storage.getItem(DEFAULT_STORAGE_KEYS.envelope), "string");
});

test("rejects an invalid envelope before writing", async () => {
  const storage = createMemoryStorage();
  const adapter = new LocalStorageAdapter({ storage });
  await adapter.initialize();
  await assert.rejects(() => adapter.saveEnvelope({ invalid: true }));
  assert.equal(storage.getItem(DEFAULT_STORAGE_KEYS.envelope), null);
});

test("stores and restores an opaque recovery backup without interpreting it", async () => {
  const storage = createMemoryStorage();
  const adapter = new LocalStorageAdapter({ storage });
  await adapter.initialize();
  await adapter.saveRecoveryBackup('{"legacy":true}');
  assert.equal(await adapter.loadRawBackup(), '{"legacy":true}');
  await assert.rejects(() => adapter.saveRecoveryBackup({ legacy: true }), StorageAdapterError);
});

test("round-trips generic local metadata and rejects invalid stored metadata", async () => {
  const storage = createMemoryStorage();
  const adapter = new LocalStorageAdapter({ storage });
  await adapter.initialize();
  await adapter.setLocalMetadata({ initialized: true, revision: 3 });
  assert.deepEqual(await adapter.getLocalMetadata(), { initialized: true, revision: 3 });

  storage.setItem(DEFAULT_STORAGE_KEYS.localMetadata, "[]");
  await assert.rejects(() => adapter.getLocalMetadata(), StorageAdapterError);
});

test("does not expose mutations to metadata after serialization", async () => {
  const storage = createMemoryStorage();
  const adapter = new LocalStorageAdapter({ storage });
  const metadata = { nested: { value: 1 } };
  await adapter.initialize();
  await adapter.setLocalMetadata(metadata);
  metadata.nested.value = 2;
  assert.deepEqual(await adapter.getLocalMetadata(), { nested: { value: 1 } });
});

test("supports custom keys so an upper layer controls storage placement", async () => {
  const storage = createMemoryStorage();
  const keys = { envelope: "data", recoveryBackup: "backup", localMetadata: "metadata" };
  const adapter = new LocalStorageAdapter({ storage, keys });
  const envelope = await readFixture("valid-envelope.json");
  await adapter.initialize();
  await adapter.saveEnvelope(envelope);
  assert.equal(typeof storage.getItem("data"), "string");
  assert.equal(storage.getItem(DEFAULT_STORAGE_KEYS.envelope), null);
});

test("requires initialization and a valid storage-like dependency", async () => {
  const adapter = new LocalStorageAdapter({ storage: createMemoryStorage() });
  await assert.rejects(() => adapter.loadEnvelope(), StorageAdapterError);
  await assert.rejects(() => new LocalStorageAdapter({ storage: {} }).initialize(), StorageAdapterError);
});

test("normalizes storage read and write failures", async () => {
  const failingRead = new LocalStorageAdapter({ storage: { getItem() { throw new Error("read failed"); }, setItem() {} } });
  await failingRead.initialize();
  await assert.rejects(() => failingRead.loadEnvelope(), error => error instanceof StorageAdapterError && error.operation === "load envelope");

  const failingWrite = new LocalStorageAdapter({ storage: { getItem() { return null; }, setItem() { throw new Error("quota"); } } });
  await failingWrite.initialize();
  await assert.rejects(() => failingWrite.setLocalMetadata({ ready: true }), error => error instanceof StorageAdapterError && error.operation === "save local metadata");
});

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(String(key), String(value)); }
  };
}

async function readFixture(name) {
  return JSON.parse(await readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
}
