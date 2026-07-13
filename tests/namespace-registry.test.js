import test from "node:test";
import assert from "node:assert/strict";
import { NamespaceRegistry } from "../src/core/namespace-registry.js";
import { NamespaceRegistrationError } from "../src/core/errors.js";
import { INITIAL_NAMESPACE_DEFINITIONS } from "../src/system/system-namespace-definitions.js";

test("registers a future tool without changing the registry implementation", () => {
  const registry = new NamespaceRegistry(INITIAL_NAMESPACE_DEFINITIONS);
  registry.register({ name: "tools.rss-center", schemaVersion: 1, syncPolicy: "shared" });
  assert.equal(registry.has("tools.rss-center"), true);
  assert.equal(registry.get("tools.rss-center").schemaVersion, 1);
});

test("rejects duplicate namespace registration", () => {
  const registry = new NamespaceRegistry([{ name: "system.settings", schemaVersion: 1 }]);
  assert.throws(
    () => registry.register({ name: "system.settings", schemaVersion: 1 }),
    NamespaceRegistrationError
  );
});

test("rejects invalid namespace names and schema versions", () => {
  const registry = new NamespaceRegistry();
  assert.throws(() => registry.register({ name: "My English", schemaVersion: 1 }), NamespaceRegistrationError);
  assert.throws(() => registry.register({ name: "tools.valid", schemaVersion: 0 }), NamespaceRegistrationError);
});

test("returns defensive definition objects", () => {
  const registry = new NamespaceRegistry([{ name: "tools.flow", schemaVersion: 1 }]);
  const definition = registry.get("tools.flow");
  assert.equal(Object.isFrozen(definition), true);
});
