import { cloneEnvelope } from "./data-contract.js";
import { RepositoryError } from "./errors.js";
import { StorageAdapter } from "./storage-adapter.js";
import { isIsoTimestamp, toIsoTimestamp } from "../shared/dates.js";

export class Repository {
  async load() {
    throw new Error("Repository.load() must be implemented.");
  }

  async replace(_data, _options) {
    throw new Error("Repository.replace() must be implemented.");
  }

  async update(_mutator, _options) {
    throw new Error("Repository.update() must be implemented.");
  }
}

export class NamespaceRepository extends Repository {
  #storageAdapter;
  #namespaceName;
  #clock;
  #writeQueue = Promise.resolve();

  constructor({ storageAdapter, namespaceName, clock = () => toIsoTimestamp() } = {}) {
    super();
    if (!(storageAdapter instanceof StorageAdapter)) {
      throw new RepositoryError("Repository requires a StorageAdapter contract implementation.", namespaceName, "construct");
    }
    if (typeof namespaceName !== "string" || !namespaceName.trim()) {
      throw new RepositoryError("Repository requires a namespace name.", namespaceName, "construct");
    }
    if (typeof clock !== "function") {
      throw new RepositoryError("Repository clock must be a function.", namespaceName, "construct");
    }
    this.#storageAdapter = storageAdapter;
    this.#namespaceName = namespaceName;
    this.#clock = clock;
  }

  get namespaceName() {
    return this.#namespaceName;
  }

  async load() {
    await this.#writeQueue;
    const envelope = await this.#loadEnvelope("load");
    return clonePlainData(this.#getNamespace(envelope, "load").data, this.#namespaceName, "load");
  }

  async replace(data, options = {}) {
    return this.#enqueueWrite(() => this.#replaceWithoutQueue(data, options, "replace"));
  }

  async update(mutator, options = {}) {
    if (typeof mutator !== "function") {
      throw new RepositoryError("Repository update requires a mutator function.", this.#namespaceName, "update");
    }
    return this.#enqueueWrite(async () => {
      const envelope = await this.#loadEnvelope("update");
      const namespace = this.#getNamespace(envelope, "update");
      const draft = clonePlainData(namespace.data, this.#namespaceName, "update");
      const returned = await mutator(draft);
      const nextData = returned === undefined ? draft : returned;
      return this.#saveNamespaceData(envelope, nextData, options, "update");
    });
  }

  async #replaceWithoutQueue(data, options, operation) {
    const envelope = await this.#loadEnvelope(operation);
    this.#getNamespace(envelope, operation);
    return this.#saveNamespaceData(envelope, data, options, operation);
  }

  async #saveNamespaceData(envelope, data, options, operation) {
    const nextData = clonePlainData(data, this.#namespaceName, operation);
    const updatedAt = options.updatedAt ?? this.#clock();
    if (!isIsoTimestamp(updatedAt)) {
      throw new RepositoryError("Repository updatedAt must be an ISO timestamp.", this.#namespaceName, operation);
    }

    const nextEnvelope = cloneEnvelope(envelope);
    nextEnvelope.namespaces[this.#namespaceName].data = nextData;
    nextEnvelope.namespaces[this.#namespaceName].updatedAt = updatedAt;
    nextEnvelope.generatedAt = updatedAt;
    await this.#storageAdapter.saveEnvelope(nextEnvelope);
    return clonePlainData(nextData, this.#namespaceName, operation);
  }

  async #loadEnvelope(operation) {
    const envelope = await this.#storageAdapter.loadEnvelope();
    if (envelope === null) {
      throw new RepositoryError("No Bonnie OS envelope is available.", this.#namespaceName, operation);
    }
    return envelope;
  }

  #getNamespace(envelope, operation) {
    const namespace = envelope.namespaces[this.#namespaceName];
    if (!namespace) {
      throw new RepositoryError(`Namespace is not available: ${this.#namespaceName}`, this.#namespaceName, operation);
    }
    return namespace;
  }

  #enqueueWrite(work) {
    const result = this.#writeQueue.then(work, work);
    this.#writeQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}

function clonePlainData(data, namespaceName, operation) {
  if (!isPlainObject(data)) {
    throw new RepositoryError("Repository namespace data must be a plain object.", namespaceName, operation);
  }
  try {
    return JSON.parse(JSON.stringify(data));
  } catch (error) {
    throw new RepositoryError("Repository namespace data must be JSON-serializable.", namespaceName, operation, error);
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
