export function selectDictionaryMetadata(entries, fallback, partOfSpeechLabels) {
  const list = Array.isArray(entries) ? entries : [];
  const primaryIpa = list.map(entry => clean(entry?.phonetic)).find(Boolean);
  const secondaryIpa = list
    .flatMap(entry => Array.isArray(entry?.phonetics) ? entry.phonetics : [])
    .map(phonetic => clean(phonetic?.text))
    .find(Boolean);
  const ipa = primaryIpa || secondaryIpa || fallback.ipa;
  const partOfSpeech = list
    .flatMap(entry => Array.isArray(entry?.meanings) ? entry.meanings : [])
    .map(meaning => clean(meaning?.partOfSpeech).toLowerCase())
    .find(Boolean);
  return {
    ipa,
    pos: partOfSpeechLabels[partOfSpeech] || fallback.pos,
    ipaSource: primaryIpa || secondaryIpa ? "dictionary-api" : fallback.ipaSource
  };
}

export function selectWiktionaryIpa(candidates) {
  const valid = (Array.isArray(candidates) ? candidates : [])
    .map(candidate => ({ text:clean(candidate?.text), context:clean(candidate?.context) }))
    .filter(candidate => /^\/.+\/$/u.test(candidate.text));
  return valid.find(candidate => /\bUS\b/i.test(candidate.context))?.text
    || valid[0]?.text
    || null;
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}
