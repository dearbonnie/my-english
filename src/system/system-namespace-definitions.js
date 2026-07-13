import { SYNC_POLICIES } from "../core/contract-constants.js";

export const INITIAL_NAMESPACE_DEFINITIONS = Object.freeze([
  Object.freeze({ name: "system.settings", schemaVersion: 1, syncPolicy: SYNC_POLICIES.SHARED }),
  Object.freeze({ name: "system.metadata", schemaVersion: 1, syncPolicy: SYNC_POLICIES.SHARED }),
  Object.freeze({ name: "tools.my-english", schemaVersion: 1, syncPolicy: SYNC_POLICIES.SHARED })
]);
