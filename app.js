// 公開サイトの主画面。JSON を読んで絵にするだけで、ここでは何も計算しない。
"use strict";

// topScope: null は主画面の機種タブに合わせる。機種キーか "all"（店全体）を選ぶとそれを保つ
const state = { period: "day", split: "all", machine: null, dayIdx: 0, monthIdx: 0,
  topMetric: "reg", topScope: null };
// 開いているトップ10（店の公開ID）。期間や機種を切り替えて描き直しても開いたままにする
const openTops = new Set();
let index = null;
const cache = new Map();
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function loadJson(path) {
  // no-cache は「毎回サーバーに更新を確かめ、同じなら手元の分を使う」。確かめずに古い JSON を使うと、
  // 新しい app.js が探す区分（土曜など）が無くて描画が止まった（2026-09-25）
  if (!cache.has(path)) cache.set(path, fetch(path, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)));
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
  const hol = (index.holidays || []).includes(iso) ? "・祝" : "";
  return `${d.getMonth() + 1}月${d.getDate()}日（${WD[d.getDay()]}${hol}）`;
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
    return { rows: (doc && doc.splits[state.split]) || [], label, nav: true };
  }
  const doc = await loadJson("data/total.json");
  const label = doc ? `累計 ${md(doc.first_date)}〜${md(doc.last_date)}` : "累計";
  return { rows: (doc && doc.splits[state.split]) || [], label, nav: false };
}

// ▽ の元。日は「その店の累計」、月は「前月」、累計は無し
async function compare() {
  if (state.period === "day") {
    const doc = await loadJson("data/total.json");
    return { rows: doc ? doc.splits.all : [], label: "この店の累計" };
  }
  if (state.period === "month" && state.monthIdx > 0) {
    // 前月も同じ切り方で比べる（土曜なら前月の土曜）
    const doc = await loadJson(`data/monthly/${index.months[state.monthIdx - 1]}.json`);
    return { rows: doc ? doc.splits[state.split] || [] : [], label: "前月" };
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
  <details class="top10" data-shop="${r.shop}"${openTops.has(r.shop) ? " open" : ""}>
    <summary>台ごとトップ10</summary><div class="topbody"></div></details>
</article>`;
}

// --- 台ごとトップ10 -------------------------------------------------------
// 主画面を開く速さを落とさないよう別ファイルにしてあり、開いたときに今の期間の1つだけ読む
function topPath() {
  if (state.period === "day") return `data/top/daily/${index.dates[state.dayIdx]}.json`;
  if (state.period === "month") return `data/top/monthly/${index.months[state.monthIdx]}.json`;
  return "data/top/total.json";
}

// BIG は設定差がごく小さく「相当」が意味を持たないので、書き出し側で null にしてある
const fmtPos = (p) => (p == null ? "" : `<small>${p < 1 ? "設定1未満" : `設定${p.toFixed(1)}相当`}</small>`);
const machineName = (k) => (index.machines.find((m) => m.key === k) || { name: k }).name;

function topRowsHtml(list, withMachine) {
  if (!list.length) return `<p class="empty">条件に合う台がありません</p>`;
  return `<table class="toptable">${list.map((t, i) => `<tr>
    <td class="rk">${i + 1}位</td>
    <td class="no">${t.no}${withMachine ? `<small>${machineName(t.machine)}</small>` : ""}</td>
    <td class="rt">${fmtRate(t.rate)}${fmtPos(t.pos)}</td>
    <td class="gm">${t.games.toLocaleString()}G</td>
    <td class="br">BB ${t.big} / RB ${t.reg}</td></tr>`).join("")}</table>`;
}

async function fillTop(el) {
  const body = el.querySelector(".topbody");
  const path = topPath();
  body.innerHTML = `<p class="empty">読み込み中…</p>`;
  const doc = await loadJson(path);
  // 読んでいる間に期間が切り替わっていたら、新しいほうの描画に任せる
  if (!el.isConnected || path !== topPath()) return;
  const byShop = !doc ? null : state.period === "day" ? doc.shops : doc.splits[state.split];
  const table = byShop && byShop[el.dataset.shop];
  // 機種の並びは機種タブと同じ順。その店・その期間に台がある機種だけ
  const keys = !table ? [] : index.machines.map((m) => m.key).filter((k) => table.machines[k]);
  let scope = state.topScope || state.machine;
  // 選んでいた機種がこの店に無ければ、主画面の機種タブに戻す
  if (scope !== "all" && !keys.includes(scope)) scope = keys.includes(state.machine) ? state.machine : keys[0];
  const scoped = !table || !scope ? null : scope === "all" ? table.all : table.machines[scope];
  const metricSeg = `<nav class="seg small">${[["big", "BIG"], ["reg", "REG"], ["combined", "合算"]].map(([v, label]) =>
    `<button data-metric="${v}" class="${state.topMetric === v ? "on" : ""}">${label}</button>`).join("")}</nav>`;
  const scopeTabs = `<nav class="pills">${keys.concat(["all"]).map((k) =>
    `<button data-scope="${k}" class="${scope === k ? "on" : ""}">${k === "all" ? "店全体" : machineName(k)}</button>`).join("")}</nav>`;
  const cond = !doc ? "" : state.period === "day"
    ? `${doc.min_games.toLocaleString()}回転以上の台から`
    : `1日平均${doc.min_games_per_day.toLocaleString()}回転以上の台から`;
  body.innerHTML = metricSeg + scopeTabs
    + (scoped ? topRowsHtml(scoped[state.topMetric], scope === "all")
              : `<p class="empty">この条件のデータはありません</p>`)
    + `<p class="cond">${cond}（対象 ${scoped ? scoped.eligible : 0}台）<a class="q" href="notes.html#top10">?</a></p>`;
  body.querySelectorAll("button[data-metric]").forEach((b) => (b.onclick = () => {
    state.topMetric = b.dataset.metric; refreshTops(); }));
  body.querySelectorAll("button[data-scope]").forEach((b) => (b.onclick = () => {
    state.topScope = b.dataset.scope; refreshTops(); }));
}

// REG/合算・機種/店全体の切替は、開いている全部の店にそろえて描き直す
function refreshTops() {
  $$("details.top10[open]").forEach(fillTop);
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
  // その機種が無い店も名前だけ下に出す。出さないと「店ごと載っていない」と誤解される
  // （ロイヤルにはマイジャグVが無く、既定のタブで店が消えて見えた。2026-09-25）
  const missing = index.shops.filter((s) => !rows.some((r) => r.shop === s.id)).map((s) => {
    const other = cur.rows.some((r) => r.shop === s.id);
    return `<article class="shop absent"><header><b>${s.name}</b></header>
  <p>${other ? "この機種は置いていません" : "この期間のデータはありません"}</p></article>`;
  }).join("");
  $("#rows").innerHTML = (rows.length
    ? rows.map((r) => rowHtml(r, cmpOf(r))).join("")
    : `<p class="empty">この条件のデータはありません</p>`) + missing;
  $$("details.top10").forEach((el) => {
    el.addEventListener("toggle", () => {
      if (el.open) { openTops.add(el.dataset.shop); fillTop(el); } else openTops.delete(el.dataset.shop);
    });
  });
  refreshTops();
}

init();
