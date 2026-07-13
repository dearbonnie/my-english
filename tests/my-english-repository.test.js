import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { StorageAdapter } from "../src/core/storage-adapter.js";
import {
  MY_ENGLISH_NAMESPACE,
  MyEnglishRepository
} from "../src/tools/my-english/my-english-repository.js";

test("binds My English to its namespace without knowing the adapter implementation", async () => {
  const envelope = JSON.parse(await readFile(new URL("./fixtures/valid-envelope.json", import.meta.url), "utf8"));
  const adapter = new ToolTestStorageAdapter(envelope);
  const repository = new MyEnglishRepository({ storageAdapter: adapter });
  assert.equal(repository.namespaceName, MY_ENGLISH_NAMESPACE);
  assert.deepEqual(await repository.load(), {});
});

test("provides record lifecycle operations without exposing storage", async () => {
  const envelope = JSON.parse(await readFile(new URL("./fixtures/valid-envelope.json", import.meta.url), "utf8"));
  envelope.namespaces["tools.my-english"].data = { records: {}, tombstones: {}, currentAnalysis: null, metadata: {} };
  const repository = new MyEnglishRepository({ storageAdapter: new ToolTestStorageAdapter(envelope), clock: () => "2026-07-12T18:00:00.000Z" });
  const record = { id: "record-1", english: "Hello", createdAt: "2026-07-12T17:00:00.000Z", updatedAt: "2026-07-12T17:00:00.000Z" };
  await repository.saveRecord(record);
  await repository.setCurrentAnalysis(record);
  await repository.softDelete(record.id, "2026-07-12T18:01:00.000Z");
  assert.equal((await repository.loadState()).records[record.id].isDeleted, true);
  await repository.restore(record.id, "2026-07-12T18:02:00.000Z");
  assert.equal((await repository.loadState()).records[record.id].isDeleted, false);
  await repository.permanentlyDelete(record.id, "2026-07-12T18:03:00.000Z");
  const state = await repository.loadState();
  assert.equal(state.records[record.id], undefined);
  assert.equal(state.tombstones[record.id].deletedAt, "2026-07-12T18:03:00.000Z");
});

class ToolTestStorageAdapter extends StorageAdapter {
  constructor(envelope) {
    super();
    this.envelope = envelope;
  }
  async loadEnvelope() { return structuredClone(this.envelope); }
  async saveEnvelope(envelope) { this.envelope = structuredClone(envelope); }
}
