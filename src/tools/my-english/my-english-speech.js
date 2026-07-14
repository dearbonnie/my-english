export const SPEECH_RATE_MAP = Object.freeze({
  "0.5": 0.5, "0.7": 0.7, "1": 1
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

export function normalizeSpeechText(value, { singleWord = false } = {}) {
  const cleaned = String(value ?? "")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
    .trim();
  if (!singleWord) return cleaned.replace(/\s+/g, " ");
  return cleaned.match(/[A-Za-z]+(?:['’][A-Za-z]+)?/)?.[0] ?? "";
}

function normalizeVoiceName(name) {
  return String(name).replace(/\s*\([^)]*\)\s*$/, "").trim().toLowerCase();
}

function voicePriority(voice) {
  const name = normalizeVoiceName(voice.name);
  const index = NATURAL_VOICE_PRIORITY.findIndex(candidate => name === candidate || name.startsWith(`${candidate} `));
  return index === -1 ? NATURAL_VOICE_PRIORITY.length : index;
}
