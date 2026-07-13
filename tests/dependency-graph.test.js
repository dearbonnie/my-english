import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../src/", import.meta.url));

test("source dependency graph has no cycles", async () => {
  const graph = await buildGraph();
  const visiting = new Set();
  const visited = new Set();

  function visit(file, trail = []) {
    if (visiting.has(file)) assert.fail(`Circular dependency: ${[...trail, file].join(" -> ")}`);
    if (visited.has(file)) return;
    visiting.add(file);
    for (const dependency of graph.get(file) ?? []) visit(dependency, [...trail, file]);
    visiting.delete(file);
    visited.add(file);
  }

  for (const file of graph.keys()) visit(file);
});

test("dependencies follow the approved one-way layer boundaries", async () => {
  const graph = await buildGraph();
  for (const [file, dependencies] of graph) {
    const layer = topLevel(file);
    for (const dependency of dependencies) {
      const dependencyLayer = topLevel(dependency);
      if (layer === "core") assert.ok(["core", "shared"].includes(dependencyLayer), `${file} must not import ${dependency}`);
      if (layer === "shared") assert.equal(dependencies.length, 0, `${file} must not import another layer`);
      if (layer === "adapters") assert.equal(dependencyLayer, "core", `${file} must only import core contracts`);
      if (layer === "system") assert.equal(dependencyLayer, "core", `${file} must only import core contracts`);
      if (layer === "tools") assert.equal(dependencyLayer, "core", `${file} must only import core repositories`);
      if (layer === "integration") assert.ok(["core", "shared", "system", "adapters", "tools"].includes(dependencyLayer), `${file} has an invalid integration dependency`);
    }
  }
});

test("no shared layer imports the Integration layer", async () => {
  const graph = await buildGraph();
  for (const [file, dependencies] of graph) {
    if (topLevel(file) === "integration") continue;
    assert.ok(dependencies.every(dependency => topLevel(dependency) !== "integration"), `${file} must not import Integration`);
  }
});

test("Repository source has no forbidden runtime or service dependency", async () => {
  const repositoryFiles = [
    resolve(ROOT, "core/repository.js"),
    resolve(ROOT, "tools/my-english/my-english-repository.js")
  ];
  const forbidden = /localStorage|sessionStorage|indexedDB|document\.|window\.|fetch\(|XMLHttpRequest|google\.|OAuth|SyncProvider|Migration/;
  for (const file of repositoryFiles) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, forbidden);
  }
});

test("Migration source is independent from repositories, storage, UI and services", async () => {
  const migrationFiles = [
    resolve(ROOT, "core/migration-registry.js"),
    resolve(ROOT, "tools/my-english/my-english-migrations.js")
  ];
  const forbidden = /Repository|StorageAdapter|LocalStorage|localStorage|sessionStorage|indexedDB|document\.|window\.|fetch\(|XMLHttpRequest|google\.|OAuth|SyncProvider/;
  for (const file of migrationFiles) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, forbidden);
  }
});

async function buildGraph() {
  const files = await listJavaScriptFiles(ROOT);
  const graph = new Map();
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const dependencies = [...source.matchAll(/from\s+["'](\.[^"']+)["']/g)]
      .map(match => resolve(dirname(file), match[1]))
      .filter(dependency => dependency.startsWith(ROOT));
    graph.set(file, dependencies);
  }
  return graph;
}

async function listJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? listJavaScriptFiles(path) : (entry.name.endsWith(".js") ? [path] : []);
  }));
  return nested.flat();
}

function topLevel(file) {
  return relative(ROOT, file).split(sep)[0];
}
