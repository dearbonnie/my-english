import test from "node:test";
import assert from "node:assert/strict";
import { actualSpeechRate, listAmericanVoices, selectVoice } from "../src/tools/my-english/my-english-speech.js";

test("maps displayed 1x to actual 0.5 and preserves slower and faster options", () => {
  assert.equal(actualSpeechRate("0.5"), 0.25);
  assert.equal(actualSpeechRate("1"), 0.5);
  assert.equal(actualSpeechRate("1.5"), 0.75);
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
