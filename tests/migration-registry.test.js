import test from "node:test";
import assert from "node:assert/strict";
import { MigrationRegistry } from "../src/core/migration-registry.js";
import { MigrationError } from "../src/core/errors.js";

test("runs every consecutive migration step in order", () => {
  const calls = [];
  const registry = new MigrationRegistry()
    .register({ namespaceName: "tools.example", fromVersion: 0, toVersion: 1, migrate: state => { calls.push("0-1"); return { ...state, schemaVersion: 1, first: true }; } })
    .register({ namespaceName: "tools.example", fromVersion: 1, toVersion: 2, migrate: state => { calls.push("1-2"); return { ...state, schemaVersion: 2, second: true }; } });

  const result = registry.migrate("tools.example", { schemaVersion: 0, value: "keep" }, 2);
  assert.deepEqual(calls, ["0-1", "1-2"]);
  assert.deepEqual(result, { schemaVersion: 2, value: "keep", first: true, second: true });
});

test("rejects direct version jumps during registration", () => {
  const registry = new MigrationRegistry();
  assert.throws(
    () => registry.register({ namespaceName: "tools.example", fromVersion: 0, toVersion: 2, migrate: state => state }),
    MigrationError
  );
});

test("rejects duplicate and missing migration steps", () => {
  const registry = new MigrationRegistry().register({ namespaceName: "tools.example", fromVersion: 0, toVersion: 1, migrate: state => ({ ...state, schemaVersion: 1 }) });
  assert.throws(
    () => registry.register({ namespaceName: "tools.example", fromVersion: 0, toVersion: 1, migrate: state => state }),
    MigrationError
  );
  assert.throws(
    () => registry.migrate("tools.example", { schemaVersion: 0 }, 2),
    error => error instanceof MigrationError && error.fromVersion === 1 && error.toVersion === 2
  );
});

test("does not mutate input state or context", () => {
  const registry = new MigrationRegistry().register({
    namespaceName: "tools.example",
    fromVersion: 0,
    toVersion: 1,
    migrate: (state, context) => ({ ...state, schemaVersion: 1, copied: context.value })
  });
  const input = { schemaVersion: 0, nested: { keep: true } };
  const context = { value: "context", nested: { keep: true } };
  const beforeInput = structuredClone(input);
  const beforeContext = structuredClone(context);
  registry.migrate("tools.example", input, 1, context);
  assert.deepEqual(input, beforeInput);
  assert.deepEqual(context, beforeContext);
});

test("blocks migration functions that try to mutate their input", () => {
  const registry = new MigrationRegistry().register({
    namespaceName: "tools.example",
    fromVersion: 0,
    toVersion: 1,
    migrate: state => { state.schemaVersion = 1; return state; }
  });
  assert.throws(() => registry.migrate("tools.example", { schemaVersion: 0 }, 1), MigrationError);
});

test("rejects asynchronous migrations and unexpected result versions", () => {
  const asynchronous = new MigrationRegistry().register({
    namespaceName: "tools.example", fromVersion: 0, toVersion: 1,
    migrate: async state => ({ ...state, schemaVersion: 1 })
  });
  assert.throws(() => asynchronous.migrate("tools.example", { schemaVersion: 0 }, 1), MigrationError);

  const wrongVersion = new MigrationRegistry().register({
    namespaceName: "tools.example", fromVersion: 0, toVersion: 1,
    migrate: state => ({ ...state, schemaVersion: 2 })
  });
  assert.throws(() => wrongVersion.migrate("tools.example", { schemaVersion: 0 }, 1), MigrationError);
});

test("returns a detached clone when no migration is needed", () => {
  const registry = new MigrationRegistry();
  const input = { schemaVersion: 1, nested: { value: 1 } };
  const result = registry.migrate("tools.example", input, 1);
  result.nested.value = 2;
  assert.equal(input.nested.value, 1);
});
