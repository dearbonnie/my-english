import { NamespaceRepository } from "../../core/repository.js";

export const MY_ENGLISH_NAMESPACE = "tools.my-english";

export class MyEnglishRepository extends NamespaceRepository {
  constructor({ storageAdapter, clock } = {}) {
    super({ storageAdapter, namespaceName: MY_ENGLISH_NAMESPACE, clock });
  }

  async loadState() {
    return normalizeState(await this.load());
  }

  async saveRecord(record) {
    return this.update(data => {
      const state = normalizeState(data);
      state.records[String(record.id)] = structuredClone(record);
      delete state.tombstones[String(record.id)];
      state.metadata.lastChangedAt = String(record.updatedAt || record.createdAt || "");
      return state;
    });
  }

  async setCurrentAnalysis(record) {
    return this.update(data => {
      const state = normalizeState(data);
      state.currentAnalysis = record ? structuredClone(record) : null;
      return state;
    });
  }

  async softDelete(id, deletedAt) {
    return this.update(data => {
      const state = normalizeState(data);
      const record = state.records[id];
      if (record) state.records[id] = { ...record, isDeleted: true, deletedAt, updatedAt: deletedAt };
      return state;
    });
  }

  async restore(id, updatedAt) {
    return this.update(data => {
      const state = normalizeState(data);
      const record = state.records[id];
      if (record) state.records[id] = { ...record, isDeleted: false, deletedAt: null, updatedAt };
      delete state.tombstones[id];
      return state;
    });
  }

  async permanentlyDelete(id, deletedAt) {
    return this.update(data => {
      const state = normalizeState(data);
      delete state.records[id];
      state.tombstones[id] = { id, deletedAt };
      return state;
    });
  }

  async replaceState(nextState) {
    return this.replace(normalizeState(nextState));
  }
}

function normalizeState(value) {
  const state = value && typeof value === "object" && !Array.isArray(value) ? structuredClone(value) : {};
  return {
    ...state,
    records: state.records && typeof state.records === "object" && !Array.isArray(state.records) ? state.records : {},
    tombstones: state.tombstones && typeof state.tombstones === "object" && !Array.isArray(state.tombstones) ? state.tombstones : {},
    currentAnalysis: state.currentAnalysis ?? null,
    metadata: state.metadata && typeof state.metadata === "object" && !Array.isArray(state.metadata) ? state.metadata : {}
  };
}
