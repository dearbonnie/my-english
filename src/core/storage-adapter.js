export class StorageAdapter {
  async initialize() {
    throw new Error("StorageAdapter.initialize() must be implemented.");
  }

  async loadEnvelope() {
    throw new Error("StorageAdapter.loadEnvelope() must be implemented.");
  }

  async saveEnvelope(_envelope) {
    throw new Error("StorageAdapter.saveEnvelope() must be implemented.");
  }

  async loadRawBackup() {
    throw new Error("StorageAdapter.loadRawBackup() must be implemented.");
  }

  async saveRecoveryBackup(_rawData) {
    throw new Error("StorageAdapter.saveRecoveryBackup() must be implemented.");
  }

  async getLocalMetadata() {
    throw new Error("StorageAdapter.getLocalMetadata() must be implemented.");
  }

  async setLocalMetadata(_metadata) {
    throw new Error("StorageAdapter.setLocalMetadata() must be implemented.");
  }
}
