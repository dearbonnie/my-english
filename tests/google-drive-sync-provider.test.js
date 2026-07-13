import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { GoogleDriveSyncProvider } from "../src/adapters/sync/google-drive-sync-provider.js";
import { GOOGLE_CLIENT_ID, GOOGLE_DRIVE_SCOPE } from "../src/config/public-google-config.js";

test("uses the approved public Client ID and only the drive.appdata scope", async () => {
  assert.match(GOOGLE_CLIENT_ID, /^332861098045-[a-z0-9]+\.apps\.googleusercontent\.com$/);
  assert.equal(GOOGLE_DRIVE_SCOPE, "https://www.googleapis.com/auth/drive.appdata");
  const providerSource = await readFile(new URL("../src/adapters/sync/google-drive-sync-provider.js", import.meta.url), "utf8");
  const scopes = providerSource.match(/https:\/\/www\.googleapis\.com\/auth\/[a-z.]+/g) ?? [];
  assert.deepEqual(scopes, [GOOGLE_DRIVE_SCOPE]);
});

test("is disabled without a Bonnie OS Client ID", async () => {
  const provider = new GoogleDriveSyncProvider();
  assert.equal(provider.configured, false);
  await assert.rejects(() => provider.connect(), /Client ID/);
});

test("passes only drive.appdata to Google Identity Services and reports popup failure", async () => {
  let options;
  let requestOptions;
  const previousGoogle = globalThis.google;
  globalThis.google = { accounts: { oauth2: {
    initTokenClient(value) {
      options = value;
      return { requestAccessToken(value) { requestOptions = value; options.error_callback({ type: "popup_failed_to_open" }); } };
    }
  } } };
  try {
    const provider = new GoogleDriveSyncProvider({ clientId: GOOGLE_CLIENT_ID });
    await assert.rejects(() => provider.connect(), /允許彈出視窗/);
    assert.equal(options.scope, GOOGLE_DRIVE_SCOPE);
    assert.deepEqual(requestOptions, { prompt: "" });
    assert.equal("client_secret" in options, false);
  } finally {
    globalThis.google = previousGoogle;
  }
});

test("frontend sync source contains no Client Secret or My English business fields", async () => {
  const source = await readFile(new URL("../src/adapters/sync/google-drive-sync-provider.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /client_secret|translation|tokens|isDeleted/);
});
