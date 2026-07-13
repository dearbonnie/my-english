import test from "node:test";
import assert from "node:assert/strict";
import { Repository } from "../src/core/repository.js";

test("defines the complete asynchronous Repository contract", async () => {
  const repository = new Repository();
  await assert.rejects(() => repository.load(), /must be implemented/);
  await assert.rejects(() => repository.replace({}), /must be implemented/);
  await assert.rejects(() => repository.update(() => ({})), /must be implemented/);
});
