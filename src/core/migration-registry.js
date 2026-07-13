import { MigrationError } from "./errors.js";
import { isValidNamespaceName } from "./namespace-registry.js";

export class MigrationRegistry {
  #migrations = new Map();

  register({ namespaceName, fromVersion, toVersion, migrate } = {}) {
    validateRegistration(namespaceName, fromVersion, toVersion, migrate);
    const namespaceMigrations = this.#migrations.get(namespaceName) ?? new Map();
    if (namespaceMigrations.has(fromVersion)) {
      throw new MigrationError("Migration step is already registered.", namespaceName, fromVersion, toVersion);
    }
    namespaceMigrations.set(fromVersion, Object.freeze({ namespaceName, fromVersion, toVersion, migrate }));
    this.#migrations.set(namespaceName, namespaceMigrations);
    return this;
  }

  has(namespaceName, fromVersion) {
    return this.#migrations.get(namespaceName)?.has(fromVersion) ?? false;
  }

  migrate(namespaceName, inputState, targetVersion, context = {}) {
    if (!isValidNamespaceName(namespaceName)) {
      throw new MigrationError("Migration requires a valid namespace name.", namespaceName);
    }
    const initial = cloneState(inputState, namespaceName);
    validateStateVersion(initial, namespaceName);
    if (!Number.isInteger(targetVersion) || targetVersion < initial.schemaVersion) {
      throw new MigrationError("Migration targetVersion must be an integer at or above the current version.", namespaceName, initial.schemaVersion, targetVersion);
    }

    let current = initial;
    while (current.schemaVersion < targetVersion) {
      const step = this.#migrations.get(namespaceName)?.get(current.schemaVersion);
      if (!step) {
        throw new MigrationError("Required consecutive migration step is not registered.", namespaceName, current.schemaVersion, current.schemaVersion + 1);
      }
      const immutableInput = deepFreeze(cloneState(current, namespaceName));
      const immutableContext = deepFreeze(cloneSerializable(context, namespaceName, "context"));
      let output;
      try {
        output = step.migrate(immutableInput, immutableContext);
      } catch (error) {
        throw new MigrationError("Migration step failed.", namespaceName, step.fromVersion, step.toVersion, error);
      }
      if (output instanceof Promise) {
        throw new MigrationError("Migration functions must be synchronous pure functions.", namespaceName, step.fromVersion, step.toVersion);
      }
      current = cloneState(output, namespaceName);
      validateStateVersion(current, namespaceName);
      if (current.schemaVersion !== step.toVersion) {
        throw new MigrationError("Migration returned an unexpected schemaVersion.", namespaceName, step.fromVersion, step.toVersion);
      }
    }
    return cloneState(current, namespaceName);
  }
}

function validateRegistration(namespaceName, fromVersion, toVersion, migrate) {
  if (!isValidNamespaceName(namespaceName)) {
    throw new MigrationError("Migration requires a valid namespace name.", namespaceName);
  }
  if (!Number.isInteger(fromVersion) || fromVersion < 0) {
    throw new MigrationError("Migration fromVersion must be a non-negative integer.", namespaceName, fromVersion, toVersion);
  }
  if (toVersion !== fromVersion + 1) {
    throw new MigrationError("Migrations must register one consecutive version step at a time.", namespaceName, fromVersion, toVersion);
  }
  if (typeof migrate !== "function") {
    throw new MigrationError("Migration step must be a function.", namespaceName, fromVersion, toVersion);
  }
}

function validateStateVersion(state, namespaceName) {
  if (!isPlainObject(state) || !Number.isInteger(state.schemaVersion) || state.schemaVersion < 0) {
    throw new MigrationError("Migration state requires a non-negative integer schemaVersion.", namespaceName);
  }
}

function cloneState(state, namespaceName) {
  const cloned = cloneSerializable(state, namespaceName, "state");
  if (!isPlainObject(cloned)) throw new MigrationError("Migration state must be a plain object.", namespaceName);
  return cloned;
}

function cloneSerializable(value, namespaceName, label) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    throw new MigrationError(`Migration ${label} must be JSON-serializable.`, namespaceName, undefined, undefined, error);
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
