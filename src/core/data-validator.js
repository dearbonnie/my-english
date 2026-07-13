import {
  DATA_FORMAT,
  DATA_FORMAT_VERSION,
  FORBIDDEN_CREDENTIAL_KEYS,
  REQUIRED_ROOT_FIELDS,
  SYNC_POLICIES
} from "./contract-constants.js";
import { isUuid } from "../shared/ids.js";
import { isIsoTimestamp } from "../shared/dates.js";
import { isValidNamespaceName } from "./namespace-registry.js";

export function validateEnvelope(envelope) {
  const errors = [];
  if (!isPlainObject(envelope)) {
    return { valid: false, errors: ["Envelope must be a plain object."] };
  }

  for (const field of REQUIRED_ROOT_FIELDS) {
    if (!Object.hasOwn(envelope, field)) errors.push(`Missing required field: ${field}`);
  }
  if (envelope.format !== DATA_FORMAT) errors.push(`Unsupported data format: ${String(envelope.format)}`);
  if (envelope.formatVersion !== DATA_FORMAT_VERSION) errors.push(`Unsupported format version: ${String(envelope.formatVersion)}`);
  if (!isUuid(envelope.envelopeId)) errors.push("envelopeId must be a UUID.");
  if (!isUuid(envelope.deviceId)) errors.push("deviceId must be a UUID.");
  if (!isIsoTimestamp(envelope.generatedAt)) errors.push("generatedAt must be an ISO timestamp.");

  if (!isPlainObject(envelope.namespaces)) {
    errors.push("namespaces must be a plain object.");
  } else {
    for (const [name, namespaceData] of Object.entries(envelope.namespaces)) {
      validateNamespace(name, namespaceData, errors);
    }
  }

  findForbiddenCredentials(envelope, "$", errors, new WeakSet());
  return { valid: errors.length === 0, errors };
}

function validateNamespace(name, namespaceData, errors) {
  if (!isValidNamespaceName(name)) {
    errors.push(`Invalid namespace name: ${name}`);
    return;
  }
  if (!isPlainObject(namespaceData)) {
    errors.push(`Namespace must be a plain object: ${name}`);
    return;
  }
  if (!Number.isInteger(namespaceData.schemaVersion) || namespaceData.schemaVersion < 1) {
    errors.push(`Namespace schemaVersion must be a positive integer: ${name}`);
  }
  if (!Object.values(SYNC_POLICIES).includes(namespaceData.syncPolicy)) {
    errors.push(`Namespace syncPolicy is invalid: ${name}`);
  }
  if (namespaceData.updatedAt !== null && !isIsoTimestamp(namespaceData.updatedAt)) {
    errors.push(`Namespace updatedAt must be null or an ISO timestamp: ${name}`);
  }
  if (!isPlainObject(namespaceData.data)) {
    errors.push(`Namespace data must be a plain object: ${name}`);
  }
}

function findForbiddenCredentials(value, path, errors, seen) {
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) {
    errors.push(`Circular data is not supported at: ${path}`);
    return;
  }
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (FORBIDDEN_CREDENTIAL_KEYS.has(normalizedKey)) {
      errors.push(`Credential field is forbidden at: ${path}.${key}`);
    }
    findForbiddenCredentials(child, `${path}.${key}`, errors, seen);
  }
  seen.delete(value);
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
