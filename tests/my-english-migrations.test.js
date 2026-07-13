import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createEnvelope } from "../src/core/data-contract.js";
import { NamespaceRegistry } from "../src/core/namespace-registry.js";
import { MigrationError } from "../src/core/errors.js";
import { INITIAL_NAMESPACE_DEFINITIONS } from "../src/system/system-namespace-definitions.js";
import {
  LEGACY_STORAGE_KEYS,
  migrateLegacyV12Snapshot
} from "../src/tools/my-english/my-english-migrations.js";

test("migrates complete v1.2 favorites, trash, current analysis and missing fields", async () => {
  const fixture = await readFixture();
  const baseEnvelope = createBaseEnvelope(fixture.migrationContext);
  const result = migrateLegacyV12Snapshot({
    storageSnapshot: fixture.storageSnapshot,
    baseEnvelope,
    migratedAt: fixture.migrationContext.migratedAt
  });
  const data = result.namespaces["tools.my-english"].data;
  const records = Object.values(data.records);

  assert.equal(records.length, 3);
  assert.equal(records.filter(record => !record.isDeleted).length, 2);
  assert.equal(records.filter(record => record.isDeleted).length, 1);
  assert.equal(data.records["trash-1"].deletedAt, "2026-07-03T01:00:00.000Z");
  assert.equal(data.currentAnalysis.id, "current-analysis");
  assert.equal(data.currentAnalysis.updatedAt, "2026-07-04T01:00:00.000Z");

  const missing = records.find(record => record.english === "Qzxwvv mystery");
  assert.match(missing.id, /^legacy-2-[0-9a-f]{8}$/);
  assert.equal(missing.translation, "翻譯資料不可用");
  assert.equal(missing.tokens[0].ipa, "暫無音標");
  assert.equal(missing.tokens[0].translation, "暫無逐字翻譯");
  assert.equal(missing.tokens[1].ipa, "暫無音標");
  assert.equal(missing.tokens[1].pos, "未辨識");
  assert.equal(missing.customNote, "preserve this unknown field");
});

test("creates a safe speech-rate default without adding a voice-gender preference", async () => {
  const fixture = await readFixture();
  const result = migrateLegacyV12Snapshot({
    storageSnapshot: fixture.storageSnapshot,
    baseEnvelope: createBaseEnvelope(fixture.migrationContext),
    migratedAt: fixture.migrationContext.migratedAt
  });
  assert.deepEqual(result.namespaces["system.settings"].data.toolSettings["tools.my-english"], {
    speechRate: "1"
  });
});

test("preserves optional legacy setting fields when a snapshot provides them", async () => {
  const fixture = await readFixture();
  const storageSnapshot = {
    ...fixture.storageSnapshot,
    [LEGACY_STORAGE_KEYS.settings]: JSON.stringify({
      speechRate: "0.75",
      preferredVoiceGender: "male",
      futureSetting: "preserve"
    })
  };
  const result = migrateLegacyV12Snapshot({
    storageSnapshot,
    baseEnvelope: createBaseEnvelope(fixture.migrationContext),
    migratedAt: fixture.migrationContext.migratedAt
  });
  assert.deepEqual(result.namespaces["system.settings"].data.toolSettings["tools.my-english"], {
    speechRate: "0.75",
    preferredVoiceGender: "male",
    futureSetting: "preserve"
  });
});

test("preserves pre-existing system settings and unknown namespaces", async () => {
  const fixture = await readFixture();
  const baseEnvelope = createBaseEnvelope(fixture.migrationContext);
  baseEnvelope.namespaces["system.settings"].data = { language: "zh-Hant" };
  baseEnvelope.namespaces["tools.future-tool"] = {
    schemaVersion: 3, syncPolicy: "shared", updatedAt: null, data: { keep: true }
  };
  const result = migrateLegacyV12Snapshot({
    storageSnapshot: fixture.storageSnapshot,
    baseEnvelope,
    migratedAt: fixture.migrationContext.migratedAt
  });
  assert.equal(result.namespaces["system.settings"].data.language, "zh-Hant");
  assert.deepEqual(result.namespaces["tools.future-tool"].data, { keep: true });
});

test("records migration metadata and every source key", async () => {
  const fixture = await readFixture();
  const result = migrateLegacyV12Snapshot({
    storageSnapshot: fixture.storageSnapshot,
    baseEnvelope: createBaseEnvelope(fixture.migrationContext),
    migratedAt: fixture.migrationContext.migratedAt
  });
  const metadata = result.namespaces["system.metadata"].data.migrations["tools.my-english"];
  assert.equal(metadata.source, "my-english-v1.2");
  assert.equal(metadata.targetSchemaVersion, 1);
  assert.deepEqual(metadata.sourceKeys, Object.values(LEGACY_STORAGE_KEYS));
});

test("is deterministic and does not mutate the storage snapshot or base envelope", async () => {
  const fixture = await readFixture();
  const baseEnvelope = createBaseEnvelope(fixture.migrationContext);
  const beforeSnapshot = structuredClone(fixture.storageSnapshot);
  const beforeEnvelope = structuredClone(baseEnvelope);
  const input = { storageSnapshot: fixture.storageSnapshot, baseEnvelope, migratedAt: fixture.migrationContext.migratedAt };
  const first = migrateLegacyV12Snapshot(input);
  const second = migrateLegacyV12Snapshot(input);
  assert.deepEqual(first, second);
  assert.deepEqual(fixture.storageSnapshot, beforeSnapshot);
  assert.deepEqual(baseEnvelope, beforeEnvelope);
});

test("rejects corrupt legacy JSON without changing the base envelope", async () => {
  const fixture = await readFixture();
  const baseEnvelope = createBaseEnvelope(fixture.migrationContext);
  const before = structuredClone(baseEnvelope);
  const storageSnapshot = { ...fixture.storageSnapshot, [LEGACY_STORAGE_KEYS.records]: "{corrupt" };
  assert.throws(
    () => migrateLegacyV12Snapshot({ storageSnapshot, baseEnvelope, migratedAt: fixture.migrationContext.migratedAt }),
    MigrationError
  );
  assert.deepEqual(baseEnvelope, before);
});

test("supports an empty legacy installation without data loss or failure", async () => {
  const fixture = await readFixture();
  const result = migrateLegacyV12Snapshot({
    storageSnapshot: {},
    baseEnvelope: createBaseEnvelope(fixture.migrationContext),
    migratedAt: fixture.migrationContext.migratedAt
  });
  assert.deepEqual(result.namespaces["tools.my-english"].data.records, {});
  assert.equal(result.namespaces["tools.my-english"].data.currentAnalysis, null);
});

test("preserves every record when corrupt legacy data contains duplicate IDs", async () => {
  const fixture = await readFixture();
  const duplicateRecords = [
    { id: "duplicate", english: "First", translation: "第一個" },
    { id: "duplicate", english: "Second", translation: "第二個" }
  ];
  const storageSnapshot = {
    [LEGACY_STORAGE_KEYS.records]: JSON.stringify(duplicateRecords),
    [LEGACY_STORAGE_KEYS.currentAnalysis]: null,
    [LEGACY_STORAGE_KEYS.settings]: null
  };
  const result = migrateLegacyV12Snapshot({
    storageSnapshot,
    baseEnvelope: createBaseEnvelope(fixture.migrationContext),
    migratedAt: fixture.migrationContext.migratedAt
  });
  const records = Object.values(result.namespaces["tools.my-english"].data.records);
  assert.equal(records.length, 2);
  assert.equal(records[1].legacyOriginalId, "duplicate");
  assert.equal(records[1].id, "duplicate-duplicate-1");
});

function createBaseEnvelope(context) {
  return createEnvelope({
    deviceId: context.deviceId,
    envelopeId: context.envelopeId,
    generatedAt: context.migratedAt,
    registry: new NamespaceRegistry(INITIAL_NAMESPACE_DEFINITIONS)
  });
}

async function readFixture() {
  return JSON.parse(await readFile(new URL("./fixtures/v1.2-local-storage.json", import.meta.url), "utf8"));
}
