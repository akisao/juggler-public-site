// 期待収支（閉店後の振り返り）。機械割と1ゲームあたりの期待差枚は Python 側（export-public）で出してあり、
// ここでは「× ゲーム数」と円への換算だけをする。速報の期待収支シミュレーターと同じ計算・同じ操作にそろえる。
// 設計書 juggler-analyzer-paste/docs/superpowers/specs/2026-10-13-expected-profit-simulator-design.md
const GAMES_PER_HOUR = 750; // アキラさんの実践の値（2026-10-13）
const YEN_PER_COIN = 20; // 等価
// つまみは10分刻み。端だけは 9:00 開店〜22:45 閉店の通し打ち（13時間45分）にそろえる
const STEP_MIN = 10, MAX_MIN = 13 * 60 + 45;
const LAST_STEP = Math.ceil(MAX_MIN / STEP_MIN);
// 19時から閉店までの約3時間半を、つまみを動かさずに見られるように（2026-10-16 アキラさん）
const DEFAULT_STEP = 21; // 3時間30分
const WEEKDAY = "日月火水木金土";

const state = { index: null, dayIdx: 0, doc: null, style: null, step: DEFAULT_STEP, sound: true };

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

async function getJson(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(path);
  return res.json();
}

const minutesOf = (step) => Math.min(step * STEP_MIN, MAX_MIN);
const signed = (n) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toLocaleString("ja-JP")}`;

function timeText(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h}時間${String(m).padStart(2, "0")}分` : `${m}分`;
}

function dateText(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const holiday = (state.index.holidays || []).includes(iso) ? "・祝" : "";
  return `${m}/${d}（${WEEKDAY[new Date(y, m - 1, d).getDay()]}${holiday}）`;
}

// つまみが1目盛り（10分）動くたびに短いクリック音を鳴らす（2026-10-13 アキラさん）。
// iPhone は人が触った瞬間にしか音を出させないので、最初に触ったときに音の準備をする。消音スイッチがオンだと鳴らない
const CLICK_HZ = 1800, CLICK_SEC = 0.03, CLICK_GAIN = 0.15, SILENT = 0.0001;
const SOUND_KEY = "pekajag-sim-sound";
let audio = null;
try { state.sound = localStorage.getItem(SOUND_KEY) !== "off"; } catch { state.sound = true; }

function unlockAudio() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
  } catch { audio = null; }
}

function click() {
  if (!state.sound) return;
  unlockAudio();
  if (!audio) return;
  const t = audio.currentTime;
  const osc = audio.createOscillator(), gain = audio.createGain();
  osc.type = "square";
  osc.frequency.value = CLICK_HZ;
  gain.gain.setValueAtTime(SILENT, t);
  gain.gain.exponentialRampToValueAtTime(CLICK_GAIN, t + 0.002);
  gain.gain.exponentialRampToValueAtTime(SILENT, t + CLICK_SEC);
  osc.connect(gain).connect(audio.destination);
  osc.start(t);
  osc.stop(t + CLICK_SEC + 0.01);
}

function renderSound() {
  document.getElementById("sound").textContent = state.sound ? "音あり" : "音なし";
}

function renderControls() {
  const box = document.getElementById("styles");
  box.replaceChildren();
  for (const s of state.index.sim_styles) {
    const b = el("button", s.key === state.style ? "on" : "", s.label);
    b.type = "button";
    b.onclick = () => { state.style = s.key; renderControls(); renderRows(); };
    box.append(b);
  }
  const min = minutesOf(state.step);
  document.getElementById("time-text").textContent = timeText(min);
  document.getElementById("games-text").textContent =
    `${Math.round((min / 60) * GAMES_PER_HOUR).toLocaleString("ja-JP")}G 回す前提`;
}

function renderRows() {
  const rows = document.getElementById("rows");
  rows.replaceChildren();
  const doc = state.doc;
  const shopName = new Map(state.index.shops.map((s) => [s.id, s.name]));
  const machineName = new Map(state.index.machines.map((m) => [m.key, m.name]));
  // 振り返りが目的なので、低い機種も全部出す（自分が座った機種の数字が要る）。期待収支の高い順
  const perGame = (r) => r.sim.styles[state.style]?.per_game ?? -Infinity;
  const hits = doc.rows.filter((r) => r.sim).sort((a, b) => perGame(b) - perGame(a));
  const notes = new Set(hits.filter((r) => r.sim.note).map((r) => r.sim.note));
  document.getElementById("notes").textContent = [...notes].join("　");
  if (!hits.length) {
    rows.append(el("p", "empty", "この日は期待収支を出せる機種がありません"));
    return;
  }
  const games = (minutesOf(state.step) / 60) * GAMES_PER_HOUR;
  for (const r of hits) {
    const s = r.sim.styles[state.style];
    const row = el("div", "sim");
    row.append(el("span", "name", `${shopName.get(r.shop) || r.shop} ${machineName.get(r.machine) || r.machine}`));
    if (!s) {
      row.append(el("span", "yen", "-"));
      row.append(el("span", "sub", "この打ち方の割数は未登録です"));
      rows.append(row);
      continue;
    }
    const coins = Math.round(games * s.per_game);
    const yen = coins * YEN_PER_COIN;
    row.append(el("span", `yen ${yen > 0 ? "plus" : yen < 0 ? "minus" : ""}`, `${signed(yen)}円`));
    // 機械割は計算に使った値そのまま（小数第2位）。丸めて出すと手で検算したときに合わない（2026-10-13 アキラさん）
    row.append(el("span", "sub",
      `推定 ${r.combined.pos.toFixed(1)}・機械割 ${s.rate.toFixed(2)}%・差枚 ${signed(coins)}枚`));
    row.append(el("span", "sub", `総回転 ${r.games.toLocaleString("ja-JP")}G・${r.units}台`));
    rows.append(row);
  }
}

async function loadDay(idx) {
  const dates = state.index.dates;
  state.dayIdx = idx;
  const iso = dates[idx];
  document.getElementById("range").textContent = dateText(iso);
  document.getElementById("prev").disabled = idx <= 0;
  document.getElementById("next").disabled = idx >= dates.length - 1;
  let doc;
  try {
    doc = await getJson(`data/daily/${iso}.json`);
  } catch {
    document.getElementById("rows").replaceChildren(el("p", "empty", "読み込めませんでした"));
    return;
  }
  if (state.dayIdx !== idx) return; // 連打で古い日の応答があとから届いたとき
  state.doc = doc;
  renderRows();
}

async function main() {
  try {
    state.index = await getJson("data/index.json");
  } catch {
    document.getElementById("range").textContent = "まだデータがありません";
    return;
  }
  if (!state.index.sim_styles || !state.index.dates.length) {
    document.getElementById("range").textContent = "まだデータがありません";
    return;
  }
  state.style = state.index.sim_styles[0].key;
  document.getElementById("controls").hidden = false;

  document.getElementById("sound").onclick = () => {
    state.sound = !state.sound;
    try { localStorage.setItem(SOUND_KEY, state.sound ? "on" : "off"); } catch { /* 覚えられなくても動く */ }
    renderSound();
    if (state.sound) click();
  };
  const slider = document.getElementById("time");
  slider.max = String(LAST_STEP);
  slider.value = String(state.step);
  for (const ev of ["pointerdown", "touchstart", "touchend"]) slider.addEventListener(ev, unlockAudio, { passive: true });
  slider.oninput = () => {
    const step = Number(slider.value);
    if (step === state.step) return;
    state.step = step;
    click();
    renderControls();
    if (state.doc) renderRows();
  };
  document.getElementById("prev").onclick = () => loadDay(state.dayIdx - 1);
  document.getElementById("next").onclick = () => loadDay(state.dayIdx + 1);
  renderSound();
  renderControls();
  await loadDay(state.index.dates.length - 1);
}

main();
