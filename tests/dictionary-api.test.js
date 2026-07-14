import test from "node:test";
import assert from "node:assert/strict";
import { selectDictionaryMetadata, selectWiktionaryIpa } from "../src/tools/my-english/my-english-dictionary-api.js";

const fallback = { ipa:"暫無音標", pos:"未辨識", ipaSource:null };
const labels = { noun:"名詞", verb:"動詞" };

test("uses a valid top-level phonetic before phonetics entries", () => {
  const result = selectDictionaryMetadata([{ phonetic:"/primary/", phonetics:[{ text:"/secondary/" }], meanings:[{ partOfSpeech:"noun" }] }], fallback, labels);
  assert.deepEqual(result, { ipa:"/primary/", pos:"名詞", ipaSource:"dictionary-api" });
});

test("skips an empty first phonetic and uses the next valid phonetics text", () => {
  const result = selectDictionaryMetadata([{ phonetic:"", phonetics:[{}, { text:"  /second/  " }], meanings:[{ partOfSpeech:"noun" }] }], fallback, labels);
  assert.deepEqual(result, { ipa:"/second/", pos:"名詞", ipaSource:"dictionary-api" });
});

test("searches later dictionary entries and preserves a legitimate slash-word IPA", () => {
  const result = selectDictionaryMetadata([
    { phonetics:[{}], meanings:[] },
    { phonetic:"/test/", meanings:[{ partOfSpeech:"verb" }] }
  ], fallback, labels);
  assert.deepEqual(result, { ipa:"/test/", pos:"動詞", ipaSource:"dictionary-api" });
});

test("uses the built-in fallback only when every API IPA source is empty", () => {
  const builtIn = { ipa:"/ɹɪˈpɑzəˌtɔɹi/", pos:"名詞", ipaSource:"built-in" };
  const result = selectDictionaryMetadata([{ phonetics:[{ audio:"repository.mp3" }], meanings:[{ partOfSpeech:"noun" }] }], builtIn, labels);
  assert.deepEqual(result, builtIn);
});

test("selects a real US Wiktionary IPA and ignores invalid text", () => {
  assert.equal(selectWiktionaryIpa([
    { text:"not IPA", context:"US" },
    { text:"/ɹɪˈpɒz.ɪ.t(ə.)ɹɪ/", context:"UK" },
    { text:"/ɹɪˈpɑ.zɪˌtɔɹ.i/", context:"US, CA" }
  ]), "/ɹɪˈpɑ.zɪˌtɔɹ.i/");
});

test("does not manufacture an IPA when Wiktionary has no valid candidate", () => {
  assert.equal(selectWiktionaryIpa([{ text:"repository", context:"US" }, { text:"", context:"" }]), null);
});
