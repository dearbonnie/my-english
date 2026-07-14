import test from "node:test";
import assert from "node:assert/strict";
import { DictionaryRepository, normalizeDictionaryKey, validWordTranslation } from "../src/tools/my-english/my-english-dictionary-repository.js";

test("normalizes dictionary keys and uses the seed dictionary before local cache", async () => {
  const storage = memoryStorage({ my_english_dictionary_cache_v1: JSON.stringify({ cross:"跨裝置快取" }) });
  const repository = new DictionaryRepository({ storage });
  assert.equal(normalizeDictionaryKey("  Cross "), "cross");
  assert.equal(await repository.lookup("Cross"), "跨／交叉");
  assert.equal(await repository.lookup("DEVICE"), "裝置");
});

test("persists a future translation source result in the local cache", async () => {
  const storage = memoryStorage();
  const repository = new DictionaryRepository({ storage });
  assert.equal(await repository.remember("Example", "例子"), true);
  assert.equal(await new DictionaryRepository({ storage }).lookup("example"), "例子");
});

test("returns null for unknown words and never fabricates an English translation", async () => {
  let calls = 0;
  const repository = new DictionaryRepository({ storage: memoryStorage(), translationSource: async word => { calls += 1; return word; } });
  assert.equal(await repository.lookup("qzxwvv"), null);
  assert.equal(await repository.remember("qzxwvv", "qzxwvv"), false);
  assert.equal(await repository.lookup("qzxwvv"), null);
  assert.equal(calls, 2);
});

test("fetches a validated missing translation once and then uses local cache", async () => {
  const storage = memoryStorage();
  let calls = 0;
  const repository = new DictionaryRepository({
    storage,
    translationSource: async word => {
      calls += 1;
      return ({ migration:"移轉", repository:"存放庫", architecture:"系統架構", synchronization:"同步處理", deployment:"部署" })[word];
    }
  });
  for (const [word, translation] of Object.entries({ migration:"移轉", repository:"存放庫", architecture:"系統架構", synchronization:"同步處理", deployment:"部署" })) {
    assert.equal(await repository.lookup(word), translation);
  }
  assert.equal(calls, 5);
  for (const [word, translation] of Object.entries({ migration:"移轉", repository:"存放庫", architecture:"系統架構", synchronization:"同步處理", deployment:"部署" })) {
    assert.equal(await repository.lookup(word), translation);
  }
  assert.equal(calls, 5);
});

test("rejects empty, same-as-English, error and explanatory translation results", () => {
  assert.equal(validWordTranslation("word", ""), false);
  assert.equal(validWordTranslation("word", "word"), false);
  assert.equal(validWordTranslation("word", "Translation error：翻譯失敗"), false);
  assert.equal(validWordTranslation("word", `這是一段超過限制且不適合作為逐字翻譯的詳細說明文字，因為它不是精簡詞義而是完整說明內容。`), false);
  assert.equal(validWordTranslation("architecture", "系統架構"), true);
});

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem:key => values.has(key) ? values.get(key) : null, setItem:(key,value) => values.set(key, String(value)) };
}
