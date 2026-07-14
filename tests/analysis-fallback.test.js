import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
const dictionarySource = await readFile(new URL("../src/tools/my-english/my-english-dictionary-repository.js", import.meta.url), "utf8");

test("normalizes dictionary lookups to lowercase", () => {
  assert.match(source, /const key = word\.toLowerCase\(\)/);
});

test("provides IPA, translation and part-of-speech fallbacks for the cross-device sync test words", () => {
  for (const word of ["cross", "device", "sync", "test"]) {
    assert.match(source, new RegExp(`${word}:"\\/[^\"]+\\/"`));
    assert.match(source, new RegExp(`${word}:"[^\"]+"`));
  }
  assert.match(dictionarySource, /cross:"跨／交叉"/);
  assert.match(dictionarySource, /device:"裝置"/);
  assert.match(dictionarySource, /sync:"同步"/);
  assert.match(dictionarySource, /test:"測試"/);
});

test("trusts a real Dictionary API IPA even when its spelling is slash-word-slash", () => {
  assert.match(source, /selectDictionaryMetadata\(entries, fallback, POS_ZH\)/);
  assert.match(source, /trustedIpa = token\.ipaSource === "dictionary-api"/);
});

test("sentence translation accepts mixed brand translations and retries unchanged phrases with context", () => {
  assert.match(source, /\!\/\[\\u3400-\\u9fff\]\/u\.test\(output\)/);
  assert.match(source, /output\.toLocaleLowerCase\("en-US"\) === input\.toLocaleLowerCase\("en-US"\)/);
  assert.match(source, /requestSentenceTranslation\(`\$\{text\.trim\(\)\} service`\)/);
  assert.match(source, /replace\(\/\\s\*\(\?:服務\|服务\)\\s\*\$\/u, ""\)/);
});

test("analysis renders a translation error in only one visible location", () => {
  assert.match(source, /\$\("inlineTranslation"\)\.textContent = error\.message/);
  assert.doesNotMatch(source, /setStatus\(error\.message, true\)/);
});

test("sentence translation safely rejects blank, error and invalid response data", () => {
  assert.match(source, /if \(!output \|\| output\.toLocaleLowerCase/);
  assert.match(source, /translation error\|warning\|quota\|invalid response/);
  assert.match(source, /catch \{ throw new Error\("翻譯失敗：免費翻譯服務回傳了無效資料。"\); \}/);
  assert.match(source, /Number\(data\.responseStatus \|\| 200\) >= 400/);
});
