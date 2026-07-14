import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { actualSpeechRate, listAmericanVoices, normalizeSpeechText, selectVoice } from "../src/tools/my-english/my-english-speech.js";

test("maps every displayed rate to the shared utterance rate scale", () => {
  assert.deepEqual(
    ["0.5","0.7","1"].map(rate => actualSpeechRate(rate)),
    [0.5,0.7,1]
  );
});

test("sentence, word, long-press and preview playback share one utterance rate assignment", async () => {
  const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
  assert.equal((source.match(/new SpeechSynthesisUtterance\(/g) || []).length, 1);
  assert.equal((source.match(/utterance\.rate\s*=\s*actualSpeechRate\(/g) || []).length, 1);
  assert.match(source, /play\(current\.english\)/);
  assert.match(source, /play\(current\.tokens\[Number\(card\.dataset\.index\)\]\.word, card, 3\)/);
  assert.match(source, /play\("Hello, welcome to My English\."\)/);
});

test("lists only real en-US voices and restores voiceURI", () => {
  const voices = [
    { name:"US Remote", voiceURI:"remote", lang:"en-US", localService:false },
    { name:"US Local", voiceURI:"local", lang:"en_US", localService:true },
    { name:"Albert", voiceURI:"raspy", lang:"en-US", localService:true },
    { name:"British", voiceURI:"uk", lang:"en-GB", localService:true }
  ];
  const listed = listAmericanVoices({ getVoices: () => voices });
  assert.deepEqual(listed.map(voice => voice.voiceURI), ["local", "remote"]);
  assert.equal(selectVoice(listed, "remote").voiceURI, "remote");
  assert.equal(selectVoice(listed, "missing").voiceURI, "local");
});

test("excludes Mac novelty voices and prefers a clear local Samantha voice", () => {
  const voices = [
    { name:"Albert", voiceURI:"Albert", lang:"en-US", localService:true },
    { name:"Whisper", voiceURI:"Whisper", lang:"en-US", localService:true },
    { name:"Samantha", voiceURI:"Samantha", lang:"en-US", localService:true },
    { name:"Eddy (英文（美國）)", voiceURI:"Eddy", lang:"en-US", localService:true },
    { name:"Remote Natural", voiceURI:"remote", lang:"en-US", localService:false }
  ];
  const listed = listAmericanVoices({ getVoices: () => voices });
  assert.deepEqual(listed.map(voice => voice.voiceURI), ["Samantha", "Eddy", "remote"]);
  assert.equal(selectVoice(listed, "Albert").voiceURI, "Samantha");
});

test("passes an uppercase I to a single-word utterance without hidden content", () => {
  assert.equal(normalizeSpeechText(" \u200BI\u200D\u0000 ", { singleWord:true }), "I");
  assert.equal(normalizeSpeechText("I /aɪ/ 代名詞 我", { singleWord:true }), "I");
  assert.notEqual(normalizeSpeechText("I", { singleWord:true }), "i");
});

test("keeps sentence speech natural without splitting it into letters", () => {
  assert.equal(normalizeSpeechText("  I\n am\u200B Bonnie  "), "I am Bonnie");
});
