import { assertValidEnvelope, cloneEnvelope } from "../../core/data-contract.js";
import { MigrationError } from "../../core/errors.js";
import { MigrationRegistry } from "../../core/migration-registry.js";

export const LEGACY_STORAGE_KEYS = Object.freeze({
  records: "my_english_pages_records_v1",
  currentAnalysis: "my_english_pages_current_v1",
  settings: "my_english_pages_settings_v1"
});

export const MY_ENGLISH_NAMESPACE = "tools.my-english";
export const MY_ENGLISH_SCHEMA_VERSION = 1;

const NO_IPA = "暫無音標";
const NO_WORD_TRANSLATION = "暫無逐字翻譯";
const NO_SENTENCE_TRANSLATION = "翻譯資料不可用";

export function createMyEnglishMigrationRegistry() {
  return new MigrationRegistry().register({
    namespaceName: MY_ENGLISH_NAMESPACE,
    fromVersion: 0,
    toVersion: 1,
    migrate: migrateMyEnglishV0ToV1
  });
}

export function migrateMyEnglishV0ToV1(legacyState, context) {
  const migratedAt = requireTimestamp(context?.migratedAt);
  const records = Array.isArray(legacyState?.data?.records) ? legacyState.data.records : [];
  const normalizedRecords = {};

  records.forEach((record, index) => {
    const normalized = normalizeRecord(record, index, migratedAt);
    if (Object.hasOwn(normalizedRecords, normalized.id)) {
      const originalId = normalized.id;
      normalized.id = `${originalId}-duplicate-${index}`;
      normalized.legacyOriginalId = originalId;
    }
    normalizedRecords[normalized.id] = normalized;
  });

  const currentAnalysis = legacyState?.data?.currentAnalysis
    ? normalizeRecord(legacyState.data.currentAnalysis, "current", migratedAt)
    : null;
  const changeTimes = Object.values(normalizedRecords).map(record => record.updatedAt);
  if (currentAnalysis) changeTimes.push(currentAnalysis.updatedAt);

  return {
    schemaVersion: 1,
    syncPolicy: "shared",
    updatedAt: migratedAt,
    data: {
      records: normalizedRecords,
      tombstones: {},
      currentAnalysis,
      metadata: {
        lastChangedAt: latestTimestamp(changeTimes, migratedAt),
        migratedFrom: "my-english-v1.2"
      }
    }
  };
}

export function migrateLegacyV12Snapshot({ storageSnapshot, baseEnvelope, migratedAt } = {}) {
  requireTimestamp(migratedAt);
  if (!isPlainObject(storageSnapshot)) {
    throw new MigrationError("Legacy storage snapshot must be a plain object.", MY_ENGLISH_NAMESPACE, 0, 1);
  }

  const rawRecords = parseStorageValue(storageSnapshot[LEGACY_STORAGE_KEYS.records], [], LEGACY_STORAGE_KEYS.records);
  const rawCurrent = parseStorageValue(storageSnapshot[LEGACY_STORAGE_KEYS.currentAnalysis], null, LEGACY_STORAGE_KEYS.currentAnalysis);
  const rawSettings = parseStorageValue(storageSnapshot[LEGACY_STORAGE_KEYS.settings], null, LEGACY_STORAGE_KEYS.settings);
  if (!Array.isArray(rawRecords)) {
    throw new MigrationError("Legacy records must be an array.", MY_ENGLISH_NAMESPACE, 0, 1);
  }

  const registry = createMyEnglishMigrationRegistry();
  const migratedNamespace = registry.migrate(MY_ENGLISH_NAMESPACE, {
    schemaVersion: 0,
    data: { records: rawRecords, currentAnalysis: rawCurrent }
  }, MY_ENGLISH_SCHEMA_VERSION, { migratedAt });

  const envelope = cloneEnvelope(baseEnvelope);
  requireNamespace(envelope, MY_ENGLISH_NAMESPACE);
  requireNamespace(envelope, "system.settings");
  requireNamespace(envelope, "system.metadata");
  envelope.namespaces[MY_ENGLISH_NAMESPACE] = migratedNamespace;
  envelope.namespaces["system.settings"].data = mergeSettings(
    envelope.namespaces["system.settings"].data,
    rawSettings
  );
  envelope.namespaces["system.settings"].updatedAt = migratedAt;
  envelope.namespaces["system.metadata"].data = mergeMigrationMetadata(
    envelope.namespaces["system.metadata"].data,
    migratedAt
  );
  envelope.namespaces["system.metadata"].updatedAt = migratedAt;
  envelope.generatedAt = migratedAt;
  assertValidEnvelope(envelope);
  return envelope;
}

function normalizeRecord(value, index, migratedAt) {
  const record = isPlainObject(value) ? value : {};
  const english = String(record.english ?? "");
  const createdAt = validTimestampOr(record.createdAt, migratedAt);
  const updatedAt = validTimestampOr(record.updatedAt, createdAt);
  const isDeleted = Boolean(record.isDeleted);
  const id = String(record.id || createLegacyId(record, index));
  return {
    ...record,
    id,
    english,
    translation: normalizeSentenceTranslation(record.translation, english),
    tokens: Array.isArray(record.tokens) ? record.tokens.map(normalizeToken) : [],
    createdAt,
    updatedAt,
    lastStudiedAt: validTimestampOr(record.lastStudiedAt, createdAt),
    isDeleted,
    deletedAt: isDeleted ? validTimestampOr(record.deletedAt, updatedAt) : null
  };
}

function normalizeToken(value) {
  const token = isPlainObject(value) ? value : {};
  const word = String(token.word ?? "");
  const ipa = !token.ipa || isFakeIpa(token.ipa, word) ? NO_IPA : String(token.ipa);
  const translation = !token.translation || String(token.translation).toLowerCase() === word.toLowerCase()
    ? NO_WORD_TRANSLATION
    : String(token.translation);
  return { ...token, word, ipa, translation, pos: String(token.pos || "未辨識") };
}

function normalizeSentenceTranslation(value, english) {
  const translation = String(value ?? "").trim();
  return !translation || translation.toLowerCase() === english.trim().toLowerCase()
    ? NO_SENTENCE_TRANSLATION
    : translation;
}

function mergeSettings(existing, legacySettings) {
  const settings = isPlainObject(legacySettings) ? legacySettings : {};
  const speechRate = ["0.5", "0.75", "1", "1.25", "1.5"].includes(String(settings.speechRate))
    ? String(settings.speechRate)
    : "1";
  return {
    ...existing,
    toolSettings: {
      ...(isPlainObject(existing?.toolSettings) ? existing.toolSettings : {}),
      [MY_ENGLISH_NAMESPACE]: { ...settings, speechRate }
    }
  };
}

function mergeMigrationMetadata(existing, migratedAt) {
  return {
    ...existing,
    migrations: {
      ...(isPlainObject(existing?.migrations) ? existing.migrations : {}),
      [MY_ENGLISH_NAMESPACE]: {
        source: "my-english-v1.2",
        targetSchemaVersion: MY_ENGLISH_SCHEMA_VERSION,
        migratedAt,
        sourceKeys: Object.values(LEGACY_STORAGE_KEYS)
      }
    }
  };
}

function parseStorageValue(value, fallback, key) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "string") {
    throw new MigrationError(`Legacy storage value must be a string or null: ${key}`, MY_ENGLISH_NAMESPACE, 0, 1);
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new MigrationError(`Legacy storage value is not valid JSON: ${key}`, MY_ENGLISH_NAMESPACE, 0, 1, error);
  }
}

function requireNamespace(envelope, namespaceName) {
  if (!envelope.namespaces[namespaceName]) {
    throw new MigrationError(`Base envelope is missing namespace: ${namespaceName}`, MY_ENGLISH_NAMESPACE, 0, 1);
  }
}

function requireTimestamp(value) {
  if (!isIsoTimestamp(value)) {
    throw new MigrationError("Migration requires an explicit ISO migratedAt timestamp.", MY_ENGLISH_NAMESPACE, 0, 1);
  }
  return value;
}

function validTimestampOr(value, fallback) {
  return isIsoTimestamp(value) ? value : fallback;
}

function latestTimestamp(values, fallback) {
  return values.filter(isIsoTimestamp).sort().at(-1) ?? fallback;
}

function isFakeIpa(ipa, word) {
  return String(ipa).trim().toLowerCase() === `/${String(word).trim().toLowerCase()}/`;
}

function createLegacyId(record, index) {
  const input = JSON.stringify(record);
  let hash = 2166136261;
  for (let offset = 0; offset < input.length; offset += 1) {
    hash ^= input.charCodeAt(offset);
    hash = Math.imul(hash, 16777619);
  }
  return `legacy-${String(index)}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isIsoTimestamp(value) {
  if (typeof value !== "string") return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}
