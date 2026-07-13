export const SPEECH_RATE_MAP = Object.freeze({
  "0.5": 0.25, "0.75": 0.375, "1": 0.5, "1.25": 0.625, "1.5": 0.75
});

const UNSUITABLE_VOICE_NAMES = new Set([
  "albert", "bad news", "bahh", "bells", "boing", "bubbles", "cellos",
  "fred", "good news", "jester", "junior", "kathy", "organ", "ralph",
  "superstar", "trinoids", "whisper", "wobble", "zarvox"
]);

const NATURAL_VOICE_PRIORITY = [
  "samantha", "ava", "allison", "susan", "zoe", "evan", "tom", "alex",
  "eddy", "flo", "reed", "rocko", "sandy", "shelley", "grandma", "grandpa"
];

export function listAmericanVoices(speech = globalThis.speechSynthesis) {
  return (speech?.getVoices?.() ?? [])
    .filter(voice => String(voice.lang).replace("_", "-").toLowerCase() === "en-us")
    .filter(voice => !UNSUITABLE_VOICE_NAMES.has(normalizeVoiceName(voice.name)))
    .sort((left, right) => Number(right.localService) - Number(left.localService)
      || voicePriority(left) - voicePriority(right)
      || left.name.localeCompare(right.name));
}

export function selectVoice(voices, savedVoiceURI) {
  return voices.find(voice => voice.voiceURI === savedVoiceURI)
    ?? voices[0]
    ?? null;
}

export function actualSpeechRate(displayRate) {
  return SPEECH_RATE_MAP[String(displayRate)] ?? SPEECH_RATE_MAP["1"];
}

function normalizeVoiceName(name) {
  return String(name).replace(/\s*\([^)]*\)\s*$/, "").trim().toLowerCase();
}

function voicePriority(voice) {
  const name = normalizeVoiceName(voice.name);
  const index = NATURAL_VOICE_PRIORITY.findIndex(candidate => name === candidate || name.startsWith(`${candidate} `));
  return index === -1 ? NATURAL_VOICE_PRIORITY.length : index;
}
