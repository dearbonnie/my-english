import { DATA_FORMAT, DATA_FORMAT_VERSION } from "./contract-constants.js";
import { DataContractError } from "./errors.js";
import { validateEnvelope } from "./data-validator.js";
import { createUuid } from "../shared/ids.js";
import { toIsoTimestamp } from "../shared/dates.js";

export function createEnvelope({ deviceId, registry, envelopeId, generatedAt, cryptoApi } = {}) {
  if (!registry?.createInitialNamespaces) {
    throw new DataContractError("A NamespaceRegistry is required to create an envelope.");
  }
  const envelope = {
    format: DATA_FORMAT,
    formatVersion: DATA_FORMAT_VERSION,
    envelopeId: envelopeId ?? createUuid(cryptoApi),
    deviceId,
    generatedAt: generatedAt ?? toIsoTimestamp(),
    namespaces: registry.createInitialNamespaces()
  };
  assertValidEnvelope(envelope);
  return envelope;
}

export function serializeEnvelope(envelope) {
  assertValidEnvelope(envelope);
  return JSON.stringify(envelope);
}

export function deserializeEnvelope(serialized) {
  let envelope;
  try {
    envelope = JSON.parse(serialized);
  } catch (error) {
    throw new DataContractError("Envelope is not valid JSON.", [error.message]);
  }
  assertValidEnvelope(envelope);
  return envelope;
}

export function cloneEnvelope(envelope) {
  return deserializeEnvelope(serializeEnvelope(envelope));
}

export function assertValidEnvelope(envelope) {
  const result = validateEnvelope(envelope);
  if (!result.valid) {
    throw new DataContractError("Envelope does not satisfy the Bonnie OS Data Contract.", result.errors);
  }
  return envelope;
}
