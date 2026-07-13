import { deserializeEnvelope, serializeEnvelope } from "../../core/data-contract.js";
import { StorageAdapter } from "../../core/storage-adapter.js";
import { StorageAdapterError } from "../../core/errors.js";

export const DEFAULT_STORAGE_KEYS = Object.freeze({
  envelope: "bonnie_os_data_v1",
  recoveryBackup: "bonnie_os_recovery_v1",
  localMetadata: "bonnie_os_local_metadata_v1"
});

export class LocalStorageAdapter extends StorageAdapter {
  #storage;
  #keys;
  #initialized = false;

  constructor({ storage, keys = DEFAULT_STORAGE_KEYS } = {}) {
    super();
    this.#storage = storage;
    this.#keys = validateKeys(keys);
  }

  async initialize() {
    validateStorage(this.#storage);
    this.#initialized = true;
  }

  async loadEnvelope() {
    this.#assertInitialized();
    const serialized = this.#read(this.#keys.envelope, "load envelope");
    return serialized === null ? null : deserializeEnvelope(serialized);
  }

  async saveEnvelope(envelope) {
    this.#assertInitialized();
    const serialized = serializeEnvelope(envelope);
    this.#write(this.#keys.envelope, serialized, "save envelope");
  }

  async loadRawBackup() {
    this.#assertInitialized();
    return this.#read(this.#keys.recoveryBackup, "load recovery backup");
  }

  async saveRecoveryBackup(rawData) {
    this.#assertInitialized();
    if (typeof rawData !== "string") {
      throw new StorageAdapterError("Recovery backup must be a string.", "save recovery backup");
    }
    this.#write(this.#keys.recoveryBackup, rawData, "save recovery backup");
  }

  async getLocalMetadata() {
    this.#assertInitialized();
    const serialized = this.#read(this.#keys.localMetadata, "load local metadata");
    if (serialized === null) return null;
    try {
      const metadata = JSON.parse(serialized);
      if (!isPlainObject(metadata)) throw new TypeError("Local metadata must be a plain object.");
      return metadata;
    } catch (error) {
      throw new StorageAdapterError("Stored local metadata is invalid.", "load local metadata", error);
    }
  }

  async setLocalMetadata(metadata) {
    this.#assertInitialized();
    if (!isPlainObject(metadata)) {
      throw new StorageAdapterError("Local metadata must be a plain object.", "save local metadata");
    }
    let serialized;
    try {
      serialized = JSON.stringify(metadata);
    } catch (error) {
      throw new StorageAdapterError("Local metadata is not serializable.", "save local metadata", error);
    }
    this.#write(this.#keys.localMetadata, serialized, "save local metadata");
  }

  #assertInitialized() {
    if (!this.#initialized) {
      throw new StorageAdapterError("Storage adapter has not been initialized.", "initialize");
    }
  }

  #read(key, operation) {
    try {
      return this.#storage.getItem(key);
    } catch (error) {
      throw new StorageAdapterError(`Unable to ${operation}.`, operation, error);
    }
  }

  #write(key, value, operation) {
    try {
      this.#storage.setItem(key, value);
    } catch (error) {
      throw new StorageAdapterError(`Unable to ${operation}.`, operation, error);
    }
  }
}

function validateStorage(storage) {
  if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
    throw new StorageAdapterError("A storage-like object with getItem and setItem is required.", "initialize");
  }
}

function validateKeys(keys) {
  if (!isPlainObject(keys)) {
    throw new StorageAdapterError("Storage keys must be a plain object.", "construct");
  }
  const normalized = {};
  for (const name of Object.keys(DEFAULT_STORAGE_KEYS)) {
    if (typeof keys[name] !== "string" || !keys[name].trim()) {
      throw new StorageAdapterError(`Storage key must be a non-empty string: ${name}`, "construct");
    }
    normalized[name] = keys[name];
  }
  if (new Set(Object.values(normalized)).size !== Object.keys(normalized).length) {
    throw new StorageAdapterError("Storage keys must be unique.", "construct");
  }
  return Object.freeze(normalized);
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
