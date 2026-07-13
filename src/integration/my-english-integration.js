import { LocalStorageAdapter } from "../adapters/storage/local-storage-adapter.js";
import { createEnvelope } from "../core/data-contract.js";
import { IntegrationError } from "../core/errors.js";
import { NamespaceRegistry } from "../core/namespace-registry.js";
import { checksum } from "../shared/checksum.js";
import { createUuid, isUuid } from "../shared/ids.js";
import { INITIAL_NAMESPACE_DEFINITIONS } from "../system/system-namespace-definitions.js";
import {
  LEGACY_STORAGE_KEYS,
  migrateLegacyV12Snapshot
} from "../tools/my-english/my-english-migrations.js";
import { MyEnglishRepository } from "../tools/my-english/my-english-repository.js";

export class MyEnglishIntegration {
  #storage;
  #cryptoApi;
  #clock;
  #adapter;
  #result = null;

  constructor({ storage, cryptoApi = globalThis.crypto, clock = () => new Date().toISOString() } = {}) {
    if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
      throw new IntegrationError("Integration requires a storage-like dependency.", "construct");
    }
    this.#storage = storage;
    this.#cryptoApi = cryptoApi;
    this.#clock = clock;
    this.#adapter = new LocalStorageAdapter({ storage });
  }

  async initialize() {
    if (this.#result) return this.#result;
    await this.#adapter.initialize();
    let envelope = await this.#adapter.loadEnvelope();
    let migrated = false;

    if (envelope === null) {
      const storageSnapshot = this.#readLegacySnapshot();
      await this.#adapter.saveRecoveryBackup(JSON.stringify(storageSnapshot));
      const metadata = await this.#adapter.getLocalMetadata();
      const migratedAt = this.#clock();
      const deviceId = isUuid(metadata?.deviceId) ? metadata.deviceId : createUuid(this.#cryptoApi);
      const baseEnvelope = createEnvelope({
        deviceId,
        envelopeId: createUuid(this.#cryptoApi),
        generatedAt: migratedAt,
        registry: new NamespaceRegistry(INITIAL_NAMESPACE_DEFINITIONS)
      });
      envelope = migrateLegacyV12Snapshot({ storageSnapshot, baseEnvelope, migratedAt });
      verifyLegacyCounts(storageSnapshot, envelope);
      const expectedChecksum = checksum(envelope);
      await this.#adapter.saveEnvelope(envelope);
      const reloaded = await this.#adapter.loadEnvelope();
      if (!reloaded || checksum(reloaded) !== expectedChecksum) {
        throw new IntegrationError("Saved Bonnie OS envelope failed checksum verification.", "verify-write");
      }
      envelope = reloaded;
      await this.#adapter.setLocalMetadata({
        ...(metadata ?? {}),
        deviceId,
        migration: {
          source: "my-english-v1.2",
          target: "bonnie-os-data-v1",
          completedAt: migratedAt,
          checksum: expectedChecksum
        }
      });
      migrated = true;
    }

    const repository = new MyEnglishRepository({ storageAdapter: this.#adapter, clock: this.#clock });
    await repository.loadState();
    this.#result = Object.freeze({ repository, migrated, envelope, deviceId: envelope.deviceId });
    return this.#result;
  }

  async getRecoverySnapshot() {
    await this.#adapter.initialize();
    const raw = await this.#adapter.loadRawBackup();
    return raw === null ? null : JSON.parse(raw);
  }

  async getDevicePreferences() {
    await this.#adapter.initialize();
    return (await this.#adapter.getLocalMetadata())?.preferences ?? {};
  }

  async setDevicePreferences(patch) {
    await this.#adapter.initialize();
    const metadata = await this.#adapter.getLocalMetadata() ?? {};
    const preferences = { ...(metadata.preferences ?? {}), ...patch };
    await this.#adapter.setLocalMetadata({ ...metadata, preferences });
    return preferences;
  }

  #readLegacySnapshot() {
    try {
      return Object.fromEntries(Object.values(LEGACY_STORAGE_KEYS).map(key => [key, this.#storage.getItem(key)]));
    } catch (error) {
      throw new IntegrationError("Unable to read the v1.2 recovery source.", "read-legacy", error);
    }
  }
}

export function createMyEnglishIntegration(options) {
  return new MyEnglishIntegration(options);
}

function verifyLegacyCounts(snapshot, envelope) {
  const raw = snapshot[LEGACY_STORAGE_KEYS.records];
  let records;
  try {
    records = raw === null ? [] : JSON.parse(raw);
  } catch (error) {
    throw new IntegrationError("Legacy record count cannot be verified.", "verify-migration", error);
  }
  if (!Array.isArray(records)) throw new IntegrationError("Legacy records are not an array.", "verify-migration");
  const migrated = Object.values(envelope.namespaces["tools.my-english"].data.records);
  if (migrated.length !== records.length) throw new IntegrationError("Migration record count mismatch.", "verify-migration");
  const oldTrash = records.filter(record => Boolean(record?.isDeleted)).length;
  const newTrash = migrated.filter(record => record.isDeleted).length;
  if (oldTrash !== newTrash) throw new IntegrationError("Migration trash count mismatch.", "verify-migration");
}
