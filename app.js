const $ = id => document.getElementById(id);
const STORE = "my_english_pages_records_v1";
const CURRENT_STORE = "my_english_pages_current_v1";
const EXPORT_VERSION = 2;
const NO_IPA = "暫無音標";
const NO_WORD_TRANSLATION = "暫無逐字翻譯";

const FALLBACK_POS = {every:"限定詞",day:"名詞",is:"動詞",a:"限定詞",good:"形容詞",to:"不定詞標記",learn:"動詞",something:"代名詞",new:"形容詞",i:"代名詞",would:"助動詞",like:"動詞",english:"專有名詞",have:"助動詞",you:"代名詞",been:"動詞",how:"副詞"};
const FALLBACK_IPA = {every:"/ˈev.ri/",day:"/deɪ/",is:"/ɪz/",a:"/ə/",good:"/ɡʊd/",to:"/tə/",learn:"/lɝːn/",something:"/ˈsʌm.θɪŋ/",new:"/nuː/",i:"/aɪ/",would:"/wʊd/",like:"/laɪk/",english:"/ˈɪŋ.ɡlɪʃ/",have:"/hæv/",you:"/juː/",been:"/bɪn/",how:"/haʊ/"};
const FALLBACK_ZH = {every:"每一個",day:"天",is:"是",a:"一個",good:"很好",to:"去／要",learn:"學習",something:"某些事物",new:"新的",i:"我",would:"會／想要",like:"喜歡",english:"英文",have:"有",you:"你",been:"曾經",how:"如何"};
const POS_ZH = {noun:"名詞",verb:"動詞",adjective:"形容詞",adverb:"副詞",pronoun:"代名詞",preposition:"介系詞",conjunction:"連接詞",interjection:"感嘆詞",determiner:"限定詞",exclamation:"感嘆詞"};

let current = null;
let records = loadRecords();
let pressTimer = null;
let analyzing = false;
const dictionaryCache = new Map();

function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function nowIso() { return new Date().toISOString(); }
function validDate(value) { return typeof value === "string" && !Number.isNaN(Date.parse(value)); }
function timestamp(value) { return validDate(value) ? Date.parse(value) : 0; }
function makeId() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function isFakeIpa(ipa, word) { return String(ipa || "").trim().toLowerCase() === `/${String(word || "").trim().toLowerCase()}/`; }

function normalizeToken(token = {}) {
  const word = String(token.word || "");
  const ipa = !token.ipa || isFakeIpa(token.ipa, word) ? NO_IPA : String(token.ipa);
  const translation = !token.translation || String(token.translation).toLowerCase() === word.toLowerCase() ? (FALLBACK_ZH[word.toLowerCase()] || NO_WORD_TRANSLATION) : String(token.translation);
  return { word, ipa, translation, pos: String(token.pos || FALLBACK_POS[word.toLowerCase()] || "未辨識") };
}

function normalizeRecord(record = {}, index = 0) {
  const createdAt = validDate(record.createdAt) ? record.createdAt : nowIso();
  const updatedAt = validDate(record.updatedAt) ? record.updatedAt : createdAt;
  return {
    id: String(record.id || `legacy-${timestamp(createdAt) || Date.now()}-${index}`),
    english: String(record.english || ""),
    translation: String(record.translation || "翻譯資料不可用"),
    tokens: Array.isArray(record.tokens) ? record.tokens.map(normalizeToken) : [],
    createdAt,
    updatedAt,
    lastStudiedAt: validDate(record.lastStudiedAt) ? record.lastStudiedAt : createdAt,
    isDeleted: Boolean(record.isDeleted),
    deletedAt: record.isDeleted && validDate(record.deletedAt) ? record.deletedAt : null
  };
}

function loadRecords() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE) || "[]");
    return Array.isArray(parsed) ? parsed.map(normalizeRecord).filter(record => record.english) : [];
  } catch (error) {
    console.error("無法讀取既有收藏，保留原始 Local Storage 未覆寫。", error);
    return [];
  }
}

function persistRecords() { localStorage.setItem(STORE, JSON.stringify(records)); }
function persistCurrent() { if (current) localStorage.setItem(CURRENT_STORE, JSON.stringify(current)); }
function setStatus(text, error = false) { $("status").textContent = text; $("status").classList.toggle("error", error); }
function setLibraryMessage(text, error = false) { $("libraryMessage").textContent = text; $("libraryMessage").classList.toggle("error", error); }

async function translateSentence(text) {
  let response;
  try {
    response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|zh-TW`);
  } catch {
    throw new Error("翻譯失敗：目前無法連線至免費翻譯服務，請檢查網路後重試。");
  }
  if (!response.ok) throw new Error(`翻譯失敗：免費翻譯服務回應錯誤（${response.status}）。`);
  const data = await response.json();
  const translated = String(data?.responseData?.translatedText || "").trim();
  const sameAsEnglish = translated.toLocaleLowerCase() === text.trim().toLocaleLowerCase();
  if (Number(data?.responseStatus || 200) >= 400 || !translated || sameAsEnglish) {
    throw new Error("翻譯失敗：服務未提供有效的中文翻譯，英文原文不會代替翻譯結果。");
  }
  return translated;
}

async function lookupDictionary(word) {
  const key = word.toLowerCase();
  if (dictionaryCache.has(key)) return dictionaryCache.get(key);
  const fallback = { ipa: FALLBACK_IPA[key] || NO_IPA, pos: FALLBACK_POS[key] || "未辨識" };
  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(key)}`);
    if (!response.ok) return fallback;
    const entries = await response.json();
    const entry = Array.isArray(entries) ? entries[0] : null;
    const phonetic = String(entry?.phonetic || entry?.phonetics?.find(item => item?.text)?.text || "").trim();
    const partOfSpeech = String(entry?.meanings?.find(item => item?.partOfSpeech)?.partOfSpeech || "").toLowerCase();
    const result = { ipa: phonetic && !isFakeIpa(phonetic, key) ? phonetic : fallback.ipa, pos: POS_ZH[partOfSpeech] || fallback.pos };
    dictionaryCache.set(key, result);
    return result;
  } catch {
    return fallback;
  }
}

async function buildAnalysis(text, existing = null) {
  const words = text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || [];
  const [translation, dictionaryRows] = await Promise.all([
    translateSentence(text),
    Promise.all(words.map(lookupDictionary))
  ]);
  const time = nowIso();
  return {
    id: existing?.id || makeId(),
    english: text,
    translation,
    tokens: words.map((word, index) => {
      const key = word.toLowerCase();
      return { word, ipa: dictionaryRows[index].ipa, translation: FALLBACK_ZH[key] || NO_WORD_TRANSLATION, pos: dictionaryRows[index].pos };
    }),
    createdAt: existing?.createdAt || time,
    updatedAt: time,
    lastStudiedAt: time,
    isDeleted: false,
    deletedAt: null
  };
}

function renderAnalysis(record) {
  $("inputText").value = record.english;
  $("inlineTranslation").textContent = record.translation;
  $("inlineTranslation").classList.remove("hidden");
  $("analysisGrid").innerHTML = record.tokens.map((token, index) => `<div class="token-card" data-index="${index}" tabindex="0" role="button" aria-label="播放 ${esc(token.word)}"><div class="token-word">${esc(token.word)}</div><div class="token-ipa">${esc(token.ipa)}</div><div class="token-translation">${esc(token.translation)}</div><div class="token-pos">${esc(token.pos)}</div></div>`).join("");
  bindCards();
  $("result").classList.remove("hidden");
  $("saveBtn").classList.remove("hidden");
}

async function analyze() {
  const text = $("inputText").value.trim();
  if (!text) return setStatus("請先輸入英文。", true);
  if (analyzing) return;
  analyzing = true;
  $("analyzeBtn").disabled = true;
  setStatus("正在分析...");
  try {
    current = await buildAnalysis(text);
    renderAnalysis(current);
    persistCurrent();
    setStatus("分析完成。");
  } catch (error) {
    current = null;
    $("inlineTranslation").textContent = error.message;
    $("inlineTranslation").classList.remove("hidden");
    $("result").classList.add("hidden");
    $("saveBtn").classList.add("hidden");
    setStatus(error.message, true);
  } finally {
    analyzing = false;
    $("analyzeBtn").disabled = false;
  }
}

function getVoice(kind) {
  const voices = speechSynthesis.getVoices();
  const preferred = kind === "female" ? ["Samantha","Ava","Allison","Aria","Jenny","Google US English"] : ["Alex","Daniel","Fred","Tom","Guy"];
  return voices.find(voice => preferred.some(name => voice.name.includes(name))) || voices.find(voice => voice.lang === "en-US") || voices.find(voice => voice.lang.startsWith("en")) || null;
}

function speakOne(text, card = null) {
  return new Promise(resolve => {
    speechSynthesis.cancel();
    document.querySelectorAll(".token-card.playing").forEach(item => item.classList.remove("playing"));
    if (card) card.classList.add("playing");
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = Number($("speedSelect").value);
    utterance.voice = getVoice($("voiceSelect").value);
    utterance.onend = utterance.onerror = () => { if (card) card.classList.remove("playing"); resolve(); };
    speechSynthesis.speak(utterance);
  });
}

async function play(text, card = null, count = 1) {
  for (let index = 0; index < count; index += 1) {
    await speakOne(text, card);
    if (index < count - 1) await new Promise(resolve => setTimeout(resolve, 800));
  }
}

function bindCards() {
  document.querySelectorAll(".token-card").forEach(card => {
    let longPress = false;
    card.addEventListener("pointerdown", () => {
      longPress = false;
      pressTimer = setTimeout(() => { longPress = true; play(current.tokens[Number(card.dataset.index)].word, card, 3); }, 600);
    });
    ["pointerup","pointerleave","pointercancel"].forEach(eventName => card.addEventListener(eventName, () => clearTimeout(pressTimer)));
    card.addEventListener("click", () => { if (!longPress) play(current.tokens[Number(card.dataset.index)].word, card, 1); });
    card.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); play(current.tokens[Number(card.dataset.index)].word, card, 1); } });
  });
}

function save() {
  if (!current) return;
  const duplicate = records.find(record => !record.isDeleted && record.english.trim().toLowerCase() === current.english.trim().toLowerCase());
  if (duplicate && duplicate.id !== current.id) return setStatus("這筆內容已收藏。", true);
  const index = records.findIndex(record => record.id === current.id);
  current.updatedAt = nowIso();
  if (index >= 0) records[index] = normalizeRecord(current, index); else records.unshift(normalizeRecord(current));
  persistRecords();
  persistCurrent();
  setStatus("已收藏到我的英文知識庫。");
  renderLibrary();
}

function formatTime(value) { return validDate(value) ? new Date(value).toLocaleString("zh-TW") : "無紀錄"; }
function recordCard(record, trash = false) {
  const actions = trash
    ? `<button data-action="restore" data-id="${esc(record.id)}">復原</button><button class="danger" data-action="forever" data-id="${esc(record.id)}">永久刪除</button>`
    : `<button data-action="continue" data-id="${esc(record.id)}">繼續學習</button><button data-action="reanalyze" data-id="${esc(record.id)}">重新分析</button><button class="danger" data-action="delete" data-id="${esc(record.id)}">刪除</button>`;
  return `<article class="kb-card"><div class="kb-en">${esc(record.english)}</div><div class="kb-zh">${esc(record.translation)}</div><div class="kb-meta">最近學習：${esc(formatTime(record.lastStudiedAt))}</div><div class="kb-actions">${actions}</div></article>`;
}

function renderLibrary() {
  const query = $("searchInput").value.trim().toLowerCase();
  const active = records.filter(record => !record.isDeleted);
  const rows = active.filter(record => !query || record.english.toLowerCase().includes(query) || record.translation.toLowerCase().includes(query));
  const latest = active.reduce((max, record) => Math.max(max, timestamp(record.lastStudiedAt)), 0);
  $("libraryStats").textContent = `收藏總數：${active.length}｜最近學習時間：${latest ? formatTime(new Date(latest).toISOString()) : "無紀錄"}`;
  $("libraryList").innerHTML = rows.length ? rows.map(record => recordCard(record)).join("") : '<div class="empty">尚無收藏資料</div>';
}

function renderTrash() {
  const rows = records.filter(record => record.isDeleted);
  $("trashList").innerHTML = rows.length ? rows.map(record => recordCard(record, true)).join("") : '<div class="empty">垃圾桶是空的</div>';
}

function continueLearning(id) {
  const index = records.findIndex(record => record.id === id && !record.isDeleted);
  if (index < 0) return;
  records[index].lastStudiedAt = nowIso();
  records[index].updatedAt = records[index].lastStudiedAt;
  current = normalizeRecord(records[index], index);
  records[index] = current;
  persistRecords();
  persistCurrent();
  renderAnalysis(current);
  switchView("learn");
  setStatus("已完整還原收藏內容，可繼續學習。");
}

async function reanalyze(id) {
  const index = records.findIndex(record => record.id === id && !record.isDeleted);
  if (index < 0 || analyzing) return;
  analyzing = true;
  setLibraryMessage("正在使用最新流程重新分析...");
  document.querySelectorAll('[data-action="reanalyze"]').forEach(button => { button.disabled = true; });
  try {
    const rebuilt = await buildAnalysis(records[index].english, records[index]);
    records[index] = normalizeRecord(rebuilt, index);
    current = records[index];
    persistRecords();
    persistCurrent();
    renderLibrary();
    setLibraryMessage("重新分析完成，原收藏已更新。");
  } catch (error) {
    setLibraryMessage(error.message, true);
  } finally {
    analyzing = false;
    document.querySelectorAll('[data-action="reanalyze"]').forEach(button => { button.disabled = false; });
  }
}

function softDelete(id) {
  const record = records.find(item => item.id === id);
  if (!record) return;
  record.isDeleted = true; record.deletedAt = nowIso(); record.updatedAt = record.deletedAt;
  persistRecords(); renderLibrary(); renderTrash();
}

function restore(id) {
  const record = records.find(item => item.id === id);
  if (!record) return;
  record.isDeleted = false; record.deletedAt = null; record.updatedAt = nowIso();
  persistRecords(); renderLibrary(); renderTrash();
}

function forever(id) {
  if (!confirm("確定永久刪除？永久刪除後無法復原。")) return;
  records = records.filter(item => item.id !== id);
  persistRecords(); renderTrash(); renderLibrary();
}

function switchView(name) {
  document.querySelectorAll(".view").forEach(view => view.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(tab => tab.classList.remove("active"));
  $(`${name}View`).classList.add("active");
  document.querySelector(`.tab[data-view="${name}"]`).classList.add("active");
  if (name === "library") renderLibrary();
  if (name === "trash") renderTrash();
}

function exportJson() {
  const payload = { app: "My English", schemaVersion: EXPORT_VERSION, exportedAt: nowIso(), records, currentAnalysis: current };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = `my-english-backup-${nowIso().slice(0, 10)}.json`; link.click();
  URL.revokeObjectURL(url);
  setLibraryMessage(`已匯出 ${records.length} 筆收藏與垃圾桶資料。`);
}

function mergeRecords(imported) {
  const merged = new Map(records.map(record => [record.id, record]));
  imported.map(normalizeRecord).forEach(record => {
    const local = merged.get(record.id);
    if (!local || timestamp(record.updatedAt) > timestamp(local.updatedAt)) merged.set(record.id, record);
  });
  records = [...merged.values()].sort((a, b) => timestamp(b.updatedAt) - timestamp(a.updatedAt));
}

async function importJson(file) {
  try {
    const payload = JSON.parse(await file.text());
    const imported = Array.isArray(payload) ? payload : payload.records;
    if (!Array.isArray(imported)) throw new Error("檔案不含有效的 records 陣列。");
    mergeRecords(imported);
    if (payload.currentAnalysis) {
      const incomingCurrent = normalizeRecord(payload.currentAnalysis);
      if (!current || timestamp(incomingCurrent.updatedAt) > timestamp(current.updatedAt)) current = incomingCurrent;
    }
    persistRecords(); persistCurrent(); renderLibrary(); renderTrash();
    setLibraryMessage(`匯入完成，共保留 ${records.length} 筆唯一資料；較新的本機資料未被覆蓋。`);
  } catch (error) {
    setLibraryMessage(`匯入失敗：${error.message}`, true);
  } finally {
    $("importFile").value = "";
  }
}

function handleCardAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const { action, id } = button.dataset;
  if (action === "continue") continueLearning(id);
  if (action === "reanalyze") reanalyze(id);
  if (action === "delete") softDelete(id);
  if (action === "restore") restore(id);
  if (action === "forever") forever(id);
}

document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => switchView(tab.dataset.view)));
$("analyzeBtn").addEventListener("click", analyze);
$("playSentenceBtn").addEventListener("click", () => current && play(current.english));
$("clearBtn").addEventListener("click", () => {
  current = null; localStorage.removeItem(CURRENT_STORE); $("inputText").value = "";
  $("inlineTranslation").classList.add("hidden"); $("result").classList.add("hidden"); $("saveBtn").classList.add("hidden"); setStatus("");
});
$("saveBtn").addEventListener("click", save);
$("searchInput").addEventListener("input", renderLibrary);
$("inputText").addEventListener("keydown", event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); analyze(); } });
$("libraryList").addEventListener("click", handleCardAction);
$("trashList").addEventListener("click", handleCardAction);
$("exportBtn").addEventListener("click", exportJson);
$("importBtn").addEventListener("click", () => $("importFile").click());
$("importFile").addEventListener("change", event => event.target.files[0] && importJson(event.target.files[0]));

renderLibrary();
renderTrash();
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js"));
