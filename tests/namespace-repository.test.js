import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { NamespaceRepository } from "../src/core/repository.js";
import { StorageAdapter } from "../src/core/storage-adapter.js";
import { RepositoryError } from "../src/core/errors.js";

const UPDATED_AT = "2026-07-12T14:00:00.000Z";

test("depends on the StorageAdapter contract rather than a concrete adapter", async () => {
  const adapter = new MemoryStorageAdapter(await readFixture("valid-envelope.json"));
  const repository = new NamespaceRepository({ storageAdapter: adapter, namespaceName: "system.settings", clock: () => UPDATED_AT });
  assert.deepEqual(await repository.load(), {});
  assert.equal(adapter.loadCount, 1);
});

test("returns detached namespace data", async () => {
  const envelope = await readFixture("valid-envelope.json");
  envelope.namespaces["system.settings"].data = { nested: { value: 1 } };
  const adapter = new MemoryStorageAdapter(envelope);
  const repository = new NamespaceRepository({ storageAdapter: adapter, namespaceName: "system.settings" });
  const loaded = await repository.load();
  loaded.nested.value = 2;
  assert.deepEqual((await repository.load()), { nested: { value: 1 } });
});

test("replaces only the target namespace and preserves unknown namespaces", async () => {
  const envelope = await readFixture("valid-envelope.json");
  envelope.namespaces["tools.future-tool"] = {
    schemaVersion: 7,
    syncPolicy: "shared",
    updatedAt: null,
    data: { preserve: true }
  };
  const adapter = new MemoryStorageAdapter(envelope);
  const repository = new NamespaceRepository({ storageAdapter: adapter, namespaceName: "system.settings", clock: () => UPDATED_AT });
  await repository.replace({ theme: "light-blue" });

  assert.deepEqual(adapter.envelope.namespaces["system.settings"].data, { theme: "light-blue" });
  assert.equal(adapter.envelope.namespaces["system.settings"].updatedAt, UPDATED_AT);
  assert.deepEqual(adapter.envelope.namespaces["tools.future-tool"].data, { preserve: true });
});

test("updates namespace data through a generic mutator", async () => {
  const envelope = await readFixture("valid-envelope.json");
  envelope.namespaces["system.settings"].data = { count: 1 };
  const adapter = new MemoryStorageAdapter(envelope);
  const repository = new NamespaceRepository({ storageAdapter: adapter, namespaceName: "system.settings", clock: () => UPDATED_AT });
  const result = await repository.update(draft => { draft.count += 1; });
  assert.deepEqual(result, { count: 2 });
  assert.deepEqual(await repository.load(), { count: 2 });
});

test("serializes concurrent writes within one repository instance", async () => {
  const envelope = await readFixture("valid-envelope.json");
  envelope.namespaces["system.settings"].data = { count: 0 };
  const adapter = new MemoryStorageAdapter(envelope);
  const repository = new NamespaceRepository({ storageAdapter: adapter, namespaceName: "system.settings", clock: () => UPDATED_AT });

  await Promise.all([
    repository.update(async draft => { await delay(5); draft.count += 1; }),
    repository.update(draft => { draft.count += 1; })
  ]);
  assert.deepEqual(await repository.load(), { count: 2 });
});

test("does not save when a mutator fails", async () => {
  const envelope = await readFixture("valid-envelope.json");
  const adapter = new MemoryStorageAdapter(envelope);
  const repository = new NamespaceRepository({ storageAdapter: adapter, namespaceName: "system.settings" });
  await assert.rejects(() => repository.update(() => { throw new Error("failed"); }), /failed/);
  assert.equal(adapter.saveCount, 0);
});

test("rejects missing envelopes, namespaces and invalid data", async () => {
  const emptyAdapter = new MemoryStorageAdapter(null);
  const missingEnvelope = new NamespaceRepository({ storageAdapter: emptyAdapter, namespaceName: "system.settings" });
  await assert.rejects(() => missingEnvelope.load(), RepositoryError);

  const adapter = new MemoryStorageAdapter(await readFixture("valid-envelope.json"));
  const missingNamespace = new NamespaceRepository({ storageAdapter: adapter, namespaceName: "tools.missing" });
  await assert.rejects(() => missingNamespace.load(), RepositoryError);

  const validRepository = new NamespaceRepository({ storageAdapter: adapter, namespaceName: "system.settings" });
  await assert.rejects(() => validRepository.replace([]), RepositoryError);
  await assert.rejects(() => validRepository.update(null), RepositoryError);
});

test("rejects dependencies that do not implement the StorageAdapter contract", () => {
  assert.throws(
    () => new NamespaceRepository({ storageAdapter: { loadEnvelope() {}, saveEnvelope() {} }, namespaceName: "system.settings" }),
    RepositoryError
  );
});

class MemoryStorageAdapter extends StorageAdapter {
  constructor(envelope) {
    super();
    this.envelope = envelope === null ? null : structuredClone(envelope);
    this.loadCount = 0;
    this.saveCount = 0;
  }

  async loadEnvelope() {
    this.loadCount += 1;
    return this.envelope === null ? null : structuredClone(this.envelope);
  }

  async saveEnvelope(envelope) {
    this.saveCount += 1;
    this.envelope = structuredClone(envelope);
  }
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function readFixture(name) {
  return JSON.parse(await readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
}
