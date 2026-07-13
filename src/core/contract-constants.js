export const DATA_FORMAT = "bonnie-os-data";
export const DATA_FORMAT_VERSION = 1;

export const SYNC_POLICIES = Object.freeze({
  SHARED: "shared",
  LOCAL_ONLY: "local-only"
});

export const REQUIRED_ROOT_FIELDS = Object.freeze([
  "format",
  "formatVersion",
  "envelopeId",
  "deviceId",
  "generatedAt",
  "namespaces"
]);

export const FORBIDDEN_CREDENTIAL_KEYS = Object.freeze(new Set([
  "accesstoken",
  "refreshtoken",
  "clientsecret",
  "password",
  "sessioncookie"
]));
