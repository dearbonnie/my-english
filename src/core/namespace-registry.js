import { SYNC_POLICIES } from "./contract-constants.js";
import { NamespaceRegistrationError } from "./errors.js";

const NAMESPACE_PATTERN = /^(system|tools)(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/;

export function isValidNamespaceName(name) {
  return typeof name === "string" && NAMESPACE_PATTERN.test(name);
}

export class NamespaceRegistry {
  #definitions = new Map();

  constructor(definitions = []) {
    definitions.forEach(definition => this.register(definition));
  }

  register(definition) {
    const normalized = normalizeDefinition(definition);
    if (this.#definitions.has(normalized.name)) {
      throw new NamespaceRegistrationError(`Namespace is already registered: ${normalized.name}`);
    }
    this.#definitions.set(normalized.name, Object.freeze(normalized));
    return this;
  }

  has(name) {
    return this.#definitions.has(name);
  }

  get(name) {
    return this.#definitions.get(name) ?? null;
  }

  list() {
    return [...this.#definitions.values()];
  }

  createInitialNamespaces() {
    return Object.fromEntries(this.list().map(definition => [definition.name, {
      schemaVersion: definition.schemaVersion,
      syncPolicy: definition.syncPolicy,
      updatedAt: null,
      data: {}
    }]));
  }
}

function normalizeDefinition(definition) {
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
    throw new NamespaceRegistrationError("Namespace definition must be an object.");
  }
  const { name, schemaVersion, syncPolicy = SYNC_POLICIES.SHARED } = definition;
  if (!isValidNamespaceName(name)) {
    throw new NamespaceRegistrationError(`Invalid namespace name: ${String(name)}`);
  }
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1) {
    throw new NamespaceRegistrationError(`Invalid schema version for namespace: ${name}`);
  }
  if (!Object.values(SYNC_POLICIES).includes(syncPolicy)) {
    throw new NamespaceRegistrationError(`Invalid sync policy for namespace: ${name}`);
  }
  return { name, schemaVersion, syncPolicy };
}
