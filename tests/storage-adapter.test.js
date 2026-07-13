import test from "node:test";
import assert from "node:assert/strict";
import { StorageAdapter } from "../src/core/storage-adapter.js";

test("defines the complete asynchronous StorageAdapter contract", async () => {
  const adapter = new StorageAdapter();
  const methods = [
    "initialize",
    "loadEnvelope",
    "saveEnvelope",
    "loadRawBackup",
    "saveRecoveryBackup",
    "getLocalMetadata",
    "setLocalMetadata"
  ];
  for (const method of methods) {
    await assert.rejects(() => adapter[method](), /must be implemented/);
  }
});
