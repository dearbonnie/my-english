export class MyEnglishSync {
  constructor({ repository, provider, deviceId, clock = () => new Date().toISOString() }) {
    this.repository = repository; this.provider = provider; this.deviceId = deviceId; this.clock = clock;
  }

  async sync() {
    if (!navigator.onLine) throw new Error("等待網路連線。");
    if (!this.provider.connected) await this.provider.connect();
    const state = await this.repository.loadState();
    const local = toPayload(state, this.deviceId, this.clock());
    const files = await this.provider.listDeviceFiles();
    const remotes = await Promise.all(files.map(file => this.provider.download(file.id)));
    const merged = remotes.map(validatePayload).reduce(mergePayloads, validatePayload(local));
    await this.repository.replaceState({ ...state, records: merged.records, tombstones: merged.tombstones });
    await this.provider.upload(`bonnie-os-my-english-${this.deviceId}.json`, merged);
    return merged;
  }
}

export function mergePayloads(left, right) {
  const records = { ...(left.records ?? {}) };
  const tombstones = { ...(left.tombstones ?? {}) };
  for (const [id, record] of Object.entries(right.records ?? {})) {
    const existing = records[id];
    const tombstone = newerTombstone(tombstones[id], right.tombstones?.[id]);
    if (tombstone && compareTime(tombstone.deletedAt, record.updatedAt) >= 0) { delete records[id]; tombstones[id] = tombstone; continue; }
    if (!existing || compareTime(record.updatedAt, existing.updatedAt) > 0) records[id] = record;
  }
  for (const [id, tombstone] of Object.entries(right.tombstones ?? {})) {
    const chosen = newerTombstone(tombstones[id], tombstone);
    const record = records[id];
    if (!record || compareTime(chosen.deletedAt, record.updatedAt) >= 0) { delete records[id]; tombstones[id] = chosen; }
  }
  for (const [id, record] of Object.entries(records)) {
    const tombstone = tombstones[id];
    if (!tombstone) continue;
    if (compareTime(tombstone.deletedAt, record.updatedAt) >= 0) delete records[id];
    else delete tombstones[id];
  }
  return { format: "bonnie-os-my-english-sync", version: 1, deviceId: left.deviceId, updatedAt: maxTime(left.updatedAt, right.updatedAt), records, tombstones };
}

export function validatePayload(payload) {
  if (!isPlainObject(payload) || payload.format !== "bonnie-os-my-english-sync" || payload.version !== 1) {
    throw new Error("Google Drive 同步資料格式不相容，本機資料未變更。");
  }
  if (!isPlainObject(payload.records) || !isPlainObject(payload.tombstones) || !isIsoTimestamp(payload.updatedAt)) {
    throw new Error("Google Drive 同步資料已損壞，本機資料未變更。");
  }
  for (const [id, record] of Object.entries(payload.records)) {
    if (!isPlainObject(record) || String(record.id) !== id || !isIsoTimestamp(record.updatedAt)) {
      throw new Error("Google Drive 收藏資料已損壞，本機資料未變更。");
    }
  }
  for (const [id, tombstone] of Object.entries(payload.tombstones)) {
    if (!isPlainObject(tombstone) || String(tombstone.id) !== id || !isIsoTimestamp(tombstone.deletedAt)) {
      throw new Error("Google Drive 刪除資料已損壞，本機資料未變更。");
    }
  }
  return structuredClone(payload);
}

function toPayload(state, deviceId, updatedAt) {
  return { format: "bonnie-os-my-english-sync", version: 1, deviceId, updatedAt, records: state.records, tombstones: state.tombstones };
}
function newerTombstone(left, right) { if (!left) return right; if (!right) return left; return compareTime(right.deletedAt, left.deletedAt) > 0 ? right : left; }
function compareTime(left, right) { return Date.parse(left || 0) - Date.parse(right || 0); }
function maxTime(left, right) { return compareTime(left, right) >= 0 ? left : right; }
function isPlainObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function isIsoTimestamp(value) { const time = Date.parse(value); return typeof value === "string" && Number.isFinite(time) && new Date(time).toISOString() === value; }
