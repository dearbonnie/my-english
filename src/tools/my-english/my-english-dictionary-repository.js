export const DICTIONARY_CACHE_KEY = "my_english_dictionary_cache_v1";

export const SEED_DICTIONARY = Object.freeze({
  every:"每一個", day:"天", is:"是", a:"一個", good:"很好", to:"去／要",
  learn:"學習", something:"某些事物", new:"新的", i:"我", would:"會／想要",
  like:"喜歡", english:"英文", have:"有", you:"你", been:"曾經", how:"如何",
  cross:"跨／交叉", device:"裝置", sync:"同步", test:"測試"
});

export function normalizeDictionaryKey(word) {
  return String(word ?? "").trim().toLocaleLowerCase("en-US");
}

export function seedTranslation(word) {
  return SEED_DICTIONARY[normalizeDictionaryKey(word)] ?? null;
}

export function validWordTranslation(word, translation) {
  const key = normalizeDictionaryKey(word);
  const value = String(translation ?? "").trim();
  if (!key || !value || value.toLocaleLowerCase("en-US") === key) return false;
  if (value.length > 40 || /[\r\n]|https?:\/\//i.test(value)) return false;
  if (/error|warning|quota|invalid|failed|failure|無法翻譯|翻譯失敗/i.test(value)) return false;
  return /[\u3400-\u9fff]/u.test(value);
}

export class DictionaryRepository {
  #storage;
  #cacheKey;
  #translationSource;

  constructor({ storage, cacheKey = DICTIONARY_CACHE_KEY, translationSource = null } = {}) {
    if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
      throw new TypeError("DictionaryRepository requires a storage-like dependency.");
    }
    this.#storage = storage;
    this.#cacheKey = cacheKey;
    this.#translationSource = typeof translationSource === "function" ? translationSource : null;
  }

  async lookup(word) {
    const key = normalizeDictionaryKey(word);
    if (!key) return null;
    const seeded = seedTranslation(key);
    if (seeded) return seeded;
    const cached = this.#readCache()[key];
    if (typeof cached === "string" && cached.trim() && cached.toLocaleLowerCase() !== key) return cached;
    if (!this.#translationSource) return null;
    try {
      const translated = await this.#translationSource(key);
      if (!validWordTranslation(key, translated)) return null;
      await this.remember(key, translated);
      return String(translated).trim();
    } catch {
      return null;
    }
  }

  async remember(word, translation) {
    const key = normalizeDictionaryKey(word);
    const value = String(translation ?? "").trim();
    if (!key || !value || value.toLocaleLowerCase() === key) return false;
    const cache = this.#readCache();
    cache[key] = value;
    this.#storage.setItem(this.#cacheKey, JSON.stringify(cache));
    return true;
  }

  #readCache() {
    try {
      const raw = this.#storage.getItem(this.#cacheKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
}
