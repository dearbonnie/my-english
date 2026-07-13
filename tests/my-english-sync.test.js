import test from "node:test";
import assert from "node:assert/strict";
import { mergePayloads, validatePayload } from "../src/tools/my-english/my-english-sync.js";

test("merges by id and updatedAt", () => {
  const left = payload({ a:{id:"a",updatedAt:"2026-01-01T00:00:00.000Z",english:"old"} });
  const right = payload({ a:{id:"a",updatedAt:"2026-01-02T00:00:00.000Z",english:"new"}, b:{id:"b",updatedAt:"2026-01-01T00:00:00.000Z"} });
  const merged = mergePayloads(left, right);
  assert.equal(merged.records.a.english, "new");
  assert.ok(merged.records.b);
});

test("deletion wins when deletedAt equals updatedAt", () => {
  const time = "2026-01-02T00:00:00.000Z";
  const left = payload({ a:{id:"a",updatedAt:time} });
  const right = { ...payload({}), tombstones:{a:{id:"a",deletedAt:time}} };
  const merged = mergePayloads(left, right);
  assert.equal(merged.records.a, undefined);
  assert.equal(merged.tombstones.a.deletedAt, time);
});

test("same-time non-deleted conflict keeps local record", () => {
  const time = "2026-01-02T00:00:00.000Z";
  const merged = mergePayloads(payload({a:{id:"a",updatedAt:time,english:"local"}}), payload({a:{id:"a",updatedAt:time,english:"remote"}}));
  assert.equal(merged.records.a.english, "local");
});

test("a newer record clears an older tombstone", () => {
  const left = { ...payload({ a:{id:"a",updatedAt:"2026-01-03T00:00:00.000Z"} }), tombstones:{a:{id:"a",deletedAt:"2026-01-02T00:00:00.000Z"}} };
  const merged = mergePayloads(left, payload({}));
  assert.ok(merged.records.a);
  assert.equal(merged.tombstones.a, undefined);
});

test("rejects corrupt remote payloads before they can reach the repository", () => {
  assert.throws(() => validatePayload({ format:"bonnie-os-my-english-sync", version:1, updatedAt:"bad", records:{}, tombstones:{} }), /本機資料未變更/);
  assert.throws(() => validatePayload({ ...payload({}), records:{a:{id:"a",updatedAt:"bad"}} }), /收藏資料已損壞/);
  assert.throws(() => validatePayload({ ...payload({}), tombstones:{a:{id:"a",deletedAt:"bad"}} }), /刪除資料已損壞/);
});

function payload(records) { return {format:"bonnie-os-my-english-sync",version:1,deviceId:"device",updatedAt:"2026-01-02T00:00:00.000Z",records,tombstones:{}}; }
