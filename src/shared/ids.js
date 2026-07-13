const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function createUuid(cryptoApi = globalThis.crypto) {
  if (!cryptoApi?.randomUUID) {
    throw new Error("A crypto.randomUUID implementation is required.");
  }
  return cryptoApi.randomUUID();
}
