const API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";
const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";

export class GoogleDriveSyncProvider {
  #clientId;
  #accessToken = null;
  #tokenClient = null;

  constructor({ clientId = "" } = {}) { this.#clientId = clientId; }
  get configured() { return Boolean(this.#clientId); }
  get connected() { return Boolean(this.#accessToken); }

  async connect() {
    if (!this.configured) throw new Error("Bonnie OS Google Client ID 尚未設定。");
    if (!globalThis.google?.accounts?.oauth2) throw new Error("Google 授權服務尚未載入。");
    return new Promise((resolve, reject) => {
      this.#tokenClient ??= globalThis.google.accounts.oauth2.initTokenClient({
        client_id: this.#clientId,
        scope: GOOGLE_DRIVE_SCOPE,
        callback: response => response?.access_token ? (this.#accessToken = response.access_token, resolve()) : reject(new Error(response?.error || "Google 授權失敗。")),
        error_callback: error => reject(new Error(
          error?.type === "popup_failed_to_open"
            ? "Google 授權視窗無法開啟，請允許彈出視窗後重試。"
            : "Google 授權尚未完成，請重試。"
        ))
      });
      this.#tokenClient.requestAccessToken({ prompt: "" });
    });
  }

  disconnect() { this.#accessToken = null; }

  async listDeviceFiles() {
    const query = encodeURIComponent("name contains 'bonnie-os-my-english-' and 'appDataFolder' in parents and trashed = false");
    const response = await this.#request(`${API}?spaces=appDataFolder&q=${query}&fields=files(id,name,modifiedTime)`);
    return response.files ?? [];
  }

  async download(fileId) {
    return this.#request(`${API}/${encodeURIComponent(fileId)}?alt=media`);
  }

  async upload(filename, payload) {
    const files = await this.listDeviceFiles();
    const existing = files.find(file => file.name === filename);
    if (existing) {
      return this.#request(`${UPLOAD_API}/${encodeURIComponent(existing.id)}?uploadType=media`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
      });
    }
    const boundary = `bonnie_os_${Date.now()}`;
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: filename, parents: ["appDataFolder"] })}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(payload)}\r\n--${boundary}--`;
    return this.#request(`${UPLOAD_API}?uploadType=multipart`, {
      method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body
    });
  }

  async #request(url, options = {}) {
    if (!this.#accessToken) throw new Error("同步需要確認才能繼續。");
    let response;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${this.#accessToken}`, ...(options.headers ?? {}) } });
      if (![429, 500, 502, 503, 504].includes(response.status)) break;
      await new Promise(resolve => setTimeout(resolve, 300 * (2 ** attempt)));
    }
    if (response.status === 401) { this.#accessToken = null; throw new Error("同步需要確認才能繼續。"); }
    if (!response.ok) throw new Error(`同步服務暫時無法使用（${response.status}）。`);
    const text = await response.text();
    return text ? JSON.parse(text) : {};
  }
}
