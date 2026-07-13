export class DataContractError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "DataContractError";
    this.details = details;
  }
}

export class NamespaceRegistrationError extends DataContractError {
  constructor(message, details = []) {
    super(message, details);
    this.name = "NamespaceRegistrationError";
  }
}

export class StorageAdapterError extends Error {
  constructor(message, operation, cause = undefined) {
    super(message);
    this.name = "StorageAdapterError";
    this.operation = operation;
    if (cause !== undefined) this.cause = cause;
  }
}

export class RepositoryError extends Error {
  constructor(message, namespaceName, operation, cause = undefined) {
    super(message);
    this.name = "RepositoryError";
    this.namespaceName = namespaceName;
    this.operation = operation;
    if (cause !== undefined) this.cause = cause;
  }
}

export class MigrationError extends Error {
  constructor(message, namespaceName, fromVersion, toVersion, cause = undefined) {
    super(message);
    this.name = "MigrationError";
    this.namespaceName = namespaceName;
    this.fromVersion = fromVersion;
    this.toVersion = toVersion;
    if (cause !== undefined) this.cause = cause;
  }
}

export class IntegrationError extends Error {
  constructor(message, operation, cause = undefined) {
    super(message);
    this.name = "IntegrationError";
    this.operation = operation;
    if (cause !== undefined) this.cause = cause;
  }
}
