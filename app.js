// 公開サイトの主画面。JSON を読んで絵にするだけで、ここでは何も計算しない。
"use strict";

const state = { period: "day", split: "all", machine: null, dayIdx: 0, monthIdx: 0 };
let index = null;
const cache = new Map();
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function loadJson(path) {
  if (!cache.has(path)) cache.set(path, fetch(path).then((r) => (r.ok ? r.json() : null)));
  return cache.get(path);
}

async function init() {
  index = await loadJson("data/index.json");
  state.dayIdx = index.dates.length - 1;
  state.monthIdx = index.months.length - 1;
  $("#updated").textContent = index.generated_at;
  $$("#period button").forEach((b) => (b.onclick = () => { state.period = b.dataset.v; render(); }));
  $$("#split button").forEach((b) => (b.onclick = () => { state.split = b.dataset.v; render(); }));
  $("#prev").onclick = () => step(-1);
  $("#next").onclick = () => step(1);
  render();
}

function step(n) {
  if (state.period === "day") state.dayIdx = clamp(state.dayIdx + n, 0, index.dates.length - 1);
  if (state.period === "month") state.monthIdx = clamp(state.monthIdx + n, 0, index.months.length - 1);
  render();
}

const WD = ["日", "月", "火", "水", "木", "金", "土"];
function fmtDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return `${d.getMonth() + 1}月${d.getDate()}日（${WD[d.getDay()]}）`;
}
const md = (iso) => `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}`;
const fmtRate = (n) => (n == null ? "—" : `1/${Math.round(n)}`);
const fmtCi = (ci) => (ci[0] == null ? "—" : `1/${Math.round(ci[0])}〜${ci[1] == null ? "∞" : "1/" + Math.round(ci[1])}`);

async function current() {
  if (state.period === "day") {
    const d = index.dates[state.dayIdx];
    const doc = await loadJson(`data/daily/${d}.json`);
    return { rows: doc ? doc.rows : [], label: fmtDate(d), nav: true };
  }
  if (state.period === "month") {
    const m = index.months[state.monthIdx];
    const doc = await loadJson(`data/monthly/${m}.json`);
    const label = doc ? `${+m.slice(5)}月（${md(doc.first_date)}〜${md(doc.last_date)}）` : m;
    return { rows: doc ? doc.splits[state.split] : [], label, nav: true };
  }
  const doc = await loadJson("data/total.json");
  const label = doc ? `累計 ${md(doc.first_date)}〜${md(doc.last_date)}` : "累計";
  return { rows: doc ? doc.splits[state.split] : [], label, nav: false };
}

// ▽ の元。日は「その店の累計」、月は「前月」、累計は無し
async function compare() {
  if (state.period === "day") {
    const doc = await loadJson("data/total.json");
    return { rows: doc ? doc.splits.all : [], label: "この店の累計" };
  }
  if (state.period === "month" && state.monthIdx > 0) {
    const doc = await loadJson(`data/monthly/${index.months[state.monthIdx - 1]}.json`);
    return { rows: doc ? doc.splits.all : [], label: "前月" };
  }
  return { rows: [], label: "" };
}

const X0 = 16, X1 = 284, W = 300;
const xOf = (p) => X0 + ((clamp(p, 0.5, 6.5) - 1) / 5) * (X1 - X0);

function scaleSvg(pt, cmp) {
  let s = `<svg viewBox="0 0 ${W} 30" class="scale" aria-hidden="true">`;
  s += `<line x1="${X0}" y1="15" x2="${X1}" y2="15" class="axis"/>`;
  for (let i = 1; i <= 6; i++) {
    s += `<line x1="${xOf(i)}" y1="10" x2="${xOf(i)}" y2="20" class="tick"/>`;
    s += `<text x="${xOf(i)}" y="29" class="tl">${i}</text>`;
  }
  if (cmp && cmp.pos != null) s += `<path d="M${xOf(cmp.pos) - 4} 1 l8 0 l-4 7 z" class="cmp"/>`;
  if (pt.pos == null) return s + `<text x="${W / 2}" y="18" class="none">回数が足りません</text></svg>`;
  // 幅（95%）は出さない。機種ごとの合計から出した平均なので、設定として見れば
  // ぶれて当たり前。あくまで目安として点だけ見せる（2026-09-23 アキラさん判断）
  const out = pt.pos < 1 || pt.pos > 6 ? " out" : "";
  s += `<circle cx="${xOf(pt.pos)}" cy="15" r="5" class="dot${out}"/>`;
  return s + "</svg>";
}

function rowHtml(r, cmp) {
  const shop = index.shops.find((s) => s.id === r.shop);
  const star = r.special ? "<em>★特定日</em>" : "";
  const days = r.days > 1 ? `<span>${r.days}日</span>` : "";
  const ms = r.mean_setting;
  const totalsNote = r.from_totals_days ? `<tr><td>機種合算のみの日</td><td>${r.from_totals_days}日</td></tr>` : "";
  return `<article class="shop">
  <header><b>${shop ? shop.name : r.shop}</b><span>${r.units > 0 ? r.units + "台" : "台数不明"}</span>${days}${star}</header>
  <div class="line"><span class="lbl">REG</span>${scaleSvg(r.reg, cmp && cmp.reg)}<span class="val">${fmtRate(r.reg.rate)}</span></div>
  <div class="line"><span class="lbl">合算</span>${scaleSvg(r.combined, cmp && cmp.combined)}<span class="val">${fmtRate(r.combined.rate)}</span></div>
  <details><summary>くわしく</summary><table>
    <tr><td>REG の幅</td><td>${fmtCi(r.reg.ci)}</td></tr>
    <tr><td>合算の幅</td><td>${fmtCi(r.combined.ci)}</td></tr>
    <tr><td>BIG</td><td>${fmtRate(r.big.rate)}（${fmtCi(r.big.ci)}）</td></tr>
    <tr><td>回転 / BB / RB</td><td>${r.games.toLocaleString()} / ${r.big_count} / ${r.reg_count}</td></tr>
    <tr><td>店舗平均設定 <a class="q" href="notes.html#mean">?</a></td><td>${ms ? `${ms.value.toFixed(2)}（${ms.low.toFixed(1)}〜${ms.high.toFixed(1)}）` : "—"}</td></tr>
    ${totalsNote}
  </table></details>
</article>`;
}

async function render() {
  $$("#period button").forEach((b) => b.classList.toggle("on", b.dataset.v === state.period));
  $$("#split button").forEach((b) => b.classList.toggle("on", b.dataset.v === state.split));
  $("#split").hidden = state.period === "day";
  const cur = await current();
  const cmp = await compare();
  $("#range").textContent = cur.label;
  $("#prev").disabled = !cur.nav || (state.period === "day" ? state.dayIdx === 0 : state.monthIdx === 0);
  $("#next").disabled = !cur.nav || (state.period === "day" ? state.dayIdx === index.dates.length - 1 : state.monthIdx === index.months.length - 1);
  $("#cmpLabel").textContent = cmp.label || "（比較なし）";

  // 機種タブは、いま出している期間にデータのある機種だけ
  const keys = index.machines.map((m) => m.key).filter((k) => cur.rows.some((r) => r.machine === k));
  if (!keys.includes(state.machine)) state.machine = keys.includes("my_juggler_v") ? "my_juggler_v" : keys[0] || null;
  $("#machines").innerHTML = keys.map((k) => {
    const m = index.machines.find((x) => x.key === k);
    return `<button data-k="${k}" class="${k === state.machine ? "on" : ""}">${m.name}</button>`;
  }).join("");
  $$("#machines button").forEach((b) => (b.onclick = () => { state.machine = b.dataset.k; render(); }));
  // 既定のマイジャグVはタブ列の右のほうにあり、スマホ幅だと画面外に隠れる
  const onTab = $("#machines button.on");
  if (onTab) onTab.scrollIntoView({ block: "nearest", inline: "center" });

  // REG の位置が高い店から。位置が出せない店は最後
  const rows = cur.rows.filter((r) => r.machine === state.machine)
    .sort((a, b) => (b.reg.pos ?? -9) - (a.reg.pos ?? -9));
  const cmpOf = (r) => cmp.rows.find((c) => c.shop === r.shop && c.machine === r.machine);
  $("#rows").innerHTML = rows.length
    ? rows.map((r) => rowHtml(r, cmpOf(r))).join("")
    : `<p class="empty">この条件のデータはありません</p>`;
}

init();
