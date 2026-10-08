// 公開サイトの主画面。JSON を読んで絵にするだけで、ここでは何も計算しない。
"use strict";

// topScope: null は主画面の機種タブに合わせる。機種キーか "all"（店全体）を選ぶとそれを保つ
// 月・累計の並び順とトップ10は常に全日。点はどの区分もタップで出し入れし、overlays に入れた分だけ色を変えて重ねる
// （全日と見比べたい、というアキラさんの要望。2026-09-27）。showAll は全日の点を出すか
// view: "grid" は店×機種の一覧（入口）、"machine" は機種を1つ選んで全店を並べる画面。
// pick は一覧で押したます目 {shop, machine}。押すとその組のカードを表の下に開く（2026-10-08 アキラさん）
const state = { period: "day", showAll: true, overlays: new Set(), machine: null, dayIdx: 0, monthIdx: 0,
  topMetric: "reg", topScope: null, view: "grid", gridMetric: "reg", pick: null };
// 並びは画面のボタンと同じ。色は style.css の --c-<キー> で決めている
const SPLITS = [["special", "特定日"], ["normal", "平常日"], ["weekday", "平日"],
  ["sat", "土曜"], ["sun", "日曜"], ["holiday", "祝日"]];
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
  $$("#split button").forEach((b) => (b.onclick = () => {
    const v = b.dataset.v;
    if (v === "all") state.showAll = !state.showAll;
    else if (state.overlays.has(v)) state.overlays.delete(v);
    else state.overlays.add(v);
    render();
  }));
  $("#prev").onclick = () => step(-1);
  $("#next").onclick = () => step(1);
  // 操作ボタンまで固定するとスマホで場所を取るので、条件の要約だけを、操作部が画面外に出たときに出す
  // （店を下まで見ていると何を表示中か分からなくなる、というアキラさんの指摘。2026-09-28）
  const sticky = $("#sticky");
  sticky.onclick = () => $("#app").scrollIntoView({ behavior: "smooth" });
  new IntersectionObserver(([e]) => {
    sticky.hidden = e.isIntersecting || e.boundingClientRect.top > 0;
  }).observe($("#machines"));
  render();
}

// 固定バーの文言。月は範囲まで書くと長いので月だけ
function stickyHtml() {
  const when = state.period === "day" ? fmtDate(index.dates[state.dayIdx])
    : state.period === "month" ? `${+index.months[state.monthIdx].slice(5)}月` : "累計";
  const parts = [when, state.view === "grid" ? "一覧" : state.machine ? machineName(state.machine) : "—"];
  if (state.period !== "day") {
    const on = (state.showAll ? [["all", "全日"]] : []).concat(SPLITS.filter(([k]) => state.overlays.has(k)));
    parts.push(on.length ? on.map(([k, label]) => `<span class="c-${k}">${label}</span>`).join("・") : "点なし");
  }
  return parts.join('<i>｜</i>');
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
const fmtInt = (n) => (n == null ? "—" : n.toLocaleString("ja-JP"));
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
    return { rows: (doc && doc.splits.all) || [], splits: doc ? doc.splits : {}, label, nav: true };
  }
  const doc = await loadJson("data/total.json");
  const label = doc ? `累計 ${md(doc.first_date)}〜${md(doc.last_date)}` : "累計";
  return { rows: (doc && doc.splits.all) || [], splits: doc ? doc.splits : {}, label, nav: false };
}

// ▽ の元。日は「その店の累計」、月は「前月」、累計は無し
async function compare() {
  if (state.period === "day") {
    const doc = await loadJson("data/total.json");
    return { rows: doc ? doc.splits.all : [], label: "この店の累計" };
  }
  if (state.period === "month" && state.monthIdx > 0) {
    const doc = await loadJson(`data/monthly/${index.months[state.monthIdx - 1]}.json`);
    return { rows: doc ? doc.splits.all || [] : [], label: "前月" };
  }
  return { rows: [], label: "" };
}

const X0 = 16, X1 = 284, W = 300, AXIS_Y = 15;
// 1〜6 の外は端のすぐ外に寄せる。0.5〜6.5 だと 6.4 を超えた点が絵の枠からはみ出して消えていた（2026-10-08）
const EDGE_MIN = 0.95, EDGE_MAX = 6.05;
const xOf = (p) => X0 + ((clamp(p, EDGE_MIN, EDGE_MAX) - 1) / 5) * (X1 - X0);
// 重なった点は下の段へ逃がす。左右にずらすと位置の意味が変わるため（2026-09-28 アキラさん案）。
// 上へ逃がさないのは、軸の上に ▽ があって紛れるから
const DOT_R = 5, MIN_GAP = 9, LANE_STEP = 8, MAX_LANE = 2;
const TALL_H = 44, SHORT_H = 30;

// 先に置いた点ほど軸に近い段を取る。全日を最初に置き、全日は常に軸の上に残す
function assignLanes(dots) {
  const placed = [];
  for (const d of dots) {
    let lane = 0;
    while (lane < MAX_LANE && placed.some((p) => p.lane === lane && Math.abs(p.x - d.x) < MIN_GAP)) lane++;
    d.lane = lane;
    placed.push(d);
  }
  return dots;
}

// extras: 重ねる区分 [{key, pt}]。全日の点を一番上に描く
function scaleSvg(pt, cmp, extras = [], showBase = true) {
  const h = extras.length ? TALL_H : SHORT_H;
  let s = `<svg viewBox="0 0 ${W} ${h}" class="scale${extras.length ? " tall" : ""}" aria-hidden="true">`;
  s += `<line x1="${X0}" y1="${AXIS_Y}" x2="${X1}" y2="${AXIS_Y}" class="axis"/>`;
  for (let i = 1; i <= 6; i++) {
    s += `<line x1="${xOf(i)}" y1="10" x2="${xOf(i)}" y2="20" class="tick"/>`;
    s += `<text x="${xOf(i)}" y="${h - 1}" class="tl">${i}</text>`;
  }
  if (cmp && cmp.pos != null) s += `<path d="M${xOf(cmp.pos) - 4} 1 l8 0 l-4 7 z" class="cmp"/>`;
  const isOut = (p) => p < 1 || p > 6;
  const base = showBase && pt.pos != null ? [{ x: xOf(pt.pos), cls: `dot${isOut(pt.pos) ? " out" : ""}`, key: null }] : [];
  const ovs = extras.filter((e) => e.pt && e.pt.pos != null)
    .map((e) => ({ x: xOf(e.pt.pos), cls: `ov c-${e.key}${isOut(e.pt.pos) ? " out" : ""}`, key: e.key }));
  const dots = assignLanes(base.concat(ovs));
  // 段を下げた点は、細い線で軸の上の本来の位置とつなぐ
  for (const d of dots) {
    if (d.lane > 0) s += `<line x1="${d.x}" y1="${AXIS_Y}" x2="${d.x}" y2="${AXIS_Y + d.lane * LANE_STEP}" class="tether c-${d.key}"/>`;
  }
  for (const d of dots.slice().reverse()) {
    s += `<circle cx="${d.x}" cy="${AXIS_Y + d.lane * LANE_STEP}" r="${DOT_R}" class="${d.cls}"/>`;
  }
  // 幅（95%）は出さない。機種ごとの合計から出した平均なので、設定として見れば
  // ぶれて当たり前。あくまで目安として点だけ見せる（2026-09-23 アキラさん判断）
  if (showBase && pt.pos == null) s += `<text x="${W / 2}" y="18" class="none">回数が足りません</text>`;
  return s + "</svg>";
}

// 重ねた区分の数字。点が重なって見分けにくいときもここで読める
function overlayHtml(extras) {
  if (!extras.length) return "";
  return `<table class="ovl">${extras.map((e) => `<tr>
    <td class="k c-${e.key}">${e.label}</td>
    <td>${e.row ? e.row.days + "日" : ""}</td>
    <td>REG ${e.row ? fmtRate(e.row.reg.rate) : "—"}</td>
    <td>合算 ${e.row ? fmtRate(e.row.combined.rate) : "—"}</td></tr>`).join("")}</table>`;
}

// 推定設定は全台の合計の確率を公表値の目盛りに置いた位置（グラフの ● と同じ数字）。
// 台ごとの推定の平均は出ている日ほど低く出るので使わない（2026-10-02 アキラさん決定・速報と同じ考え方）
const fmtSetting = (pt) => (pt && pt.pos != null ? pt.pos.toFixed(1) : "—");

function rowHtml(r, cmp, extras = [], showBase = true) {
  const shop = index.shops.find((s) => s.id === r.shop);
  const star = r.special ? "<em>★特定日</em>" : "";
  const days = r.days > 1 ? `<span>${r.days}日</span>` : "";
  const totalsNote = r.from_totals_days ? `<tr><td>機種合算のみの日</td><td>${r.from_totals_days}日</td></tr>` : "";
  return `<article class="shop">
  <header><b>${shop ? shop.name : r.shop}</b><span>${r.units > 0 ? r.units + "台" : "台数不明"}</span>${days}${star}</header>
  <div class="line"><span class="lbl">REG</span>${scaleSvg(r.reg, cmp && cmp.reg,
    extras.map((e) => ({ key: e.key, pt: e.row && e.row.reg })), showBase)}<span class="val">${showBase ? fmtRate(r.reg.rate) : ""}</span></div>
  <div class="line"><span class="lbl">合算</span>${scaleSvg(r.combined, cmp && cmp.combined,
    extras.map((e) => ({ key: e.key, pt: e.row && e.row.combined })), showBase)}<span class="val">${showBase ? fmtRate(r.combined.rate) : ""}</span></div>
  ${overlayHtml(extras)}
  <details><summary>くわしく</summary><table>
    <tr><td>REG の幅</td><td>${fmtCi(r.reg.ci)}</td></tr>
    <tr><td>合算の幅</td><td>${fmtCi(r.combined.ci)}</td></tr>
    <tr><td>BIG</td><td>${fmtRate(r.big.rate)}（${fmtCi(r.big.ci)}）</td></tr>
    <tr><td colspan="2"><table class="cnt">
      <tr><th>回転</th><th>BB</th><th>RB</th></tr>
      <tr><td>${fmtInt(r.games)}</td><td>${fmtInt(r.big_count)}</td><td>${fmtInt(r.reg_count)}</td></tr>
    </table></td></tr>
    <tr><td>推定設定 <a class="q" href="notes.html#mean">?</a></td><td>合算 ${fmtSetting(r.combined)}　REG ${fmtSetting(r.reg)}　BIG ${fmtSetting(r.big)}</td></tr>
    ${totalsNote}
  </table></details>
  <details class="top10" data-shop="${r.shop}"${openTops.has(r.shop) ? " open" : ""}>
    <summary>台ごとトップ10</summary><div class="topbody"></div></details>
</article>`;
}

// --- 店×機種の一覧 -------------------------------------------------------
// 表の列はスマホ幅に6〜7機種を入れるので短い名前にする。無い機種は正式名のまま
const SHORT_MACHINE = { my_juggler_v: "マイV", my_juggler_vi: "マイⅥ", neo_aim_juggler_ex: "ネオアイム",
  gogo_juggler_3: "ゴーゴー3", happy_juggler_v3: "ハッピーV3", funky_juggler_2: "ファンキー2",
  juggler_girls_ss: "ガールズSS" };
const shortShop = (name) => name.replace(/(苫小牧駅前店|苫小牧店|沼ノ端店|店)$/, "");
// 色の濃さは目盛りの位置そのまま（1 で薄く 6 で濃く）。順位や平均からの差にはしない
function cellStyle(pos) {
  const t = clamp((pos - 1) / 5, 0, 1);
  return `background:rgba(211,69,43,${(0.06 + 0.8 * t).toFixed(2)});${t > 0.55 ? "color:#fff;" : ""}`;
}
const fmtCell = (pos) => (pos < 1 ? "&lt;1" : pos.toFixed(1));

function gridHtml(rows, keys) {
  const metric = state.gridMetric;
  const seg = `<nav class="seg small" id="gridMetric">${[["reg", "REG"], ["combined", "合算"]].map(([v, label]) =>
    `<button data-gm="${v}" class="${metric === v ? "on" : ""}">${label}</button>`).join("")}</nav>`;
  const head = `<tr><th class="sh"></th>${keys.map((k) => `<th>${SHORT_MACHINE[k] || machineName(k)}</th>`).join("")}</tr>`;
  const body = index.shops.map((s) => {
    const mine = rows.filter((r) => r.shop === s.id);
    const star = mine.some((r) => r.special) ? "<em>★</em>" : "";
    const cells = keys.map((k) => {
      const r = mine.find((x) => x.machine === k);
      if (!r) return `<td class="na">−</td>`;
      const pos = r[metric].pos;
      const on = state.pick && state.pick.shop === s.id && state.pick.machine === k ? " pick" : "";
      if (pos == null) return `<td class="cell nodata${on}" data-shop="${s.id}" data-k="${k}">…</td>`;
      return `<td class="cell${on}" data-shop="${s.id}" data-k="${k}" style="${cellStyle(pos)}">${fmtCell(pos)}</td>`;
    }).join("");
    return `<tr${mine.length ? "" : ' class="absent"'}><th class="sh">${shortShop(s.name)}${star}</th>${cells}</tr>`;
  }).join("");
  const note = state.period === "day" ? "" : "表は全日の数字。特定日・曜日のボタンは、開いたカードにだけ重なります。";
  return `${seg}<table class="grid">${head}${body}</table>
  <p class="gridnote">数字は推定設定（${metric === "reg" ? "REG" : "合算"}の実測を公表値の目盛りに置いた位置）。赤いほど高い。−は置いていない機種、…は回数が足りない組。ます目を押すとくわしく見られます。${note}</p>`;
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
    <td class="gm">${fmtInt(t.games)}G</td>
    <td class="br">BB ${fmtInt(t.big)} / RB ${fmtInt(t.reg)}</td></tr>`).join("")}</table>`;
}

async function fillTop(el) {
  const body = el.querySelector(".topbody");
  const path = topPath();
  body.innerHTML = `<p class="empty">読み込み中…</p>`;
  const doc = await loadJson(path);
  // 読んでいる間に期間が切り替わっていたら、新しいほうの描画に任せる
  if (!el.isConnected || path !== topPath()) return;
  const byShop = !doc ? null : state.period === "day" ? doc.shops : doc.splits.all;
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
  $$("#split button").forEach((b) => b.classList.toggle("on", b.dataset.v === "all" ? state.showAll : state.overlays.has(b.dataset.v)));
  $("#split").hidden = state.period === "day";
  const cur = await current();
  const cmp = await compare();
  $("#range").textContent = cur.label;
  $("#prev").disabled = !cur.nav || (state.period === "day" ? state.dayIdx === 0 : state.monthIdx === 0);
  $("#next").disabled = !cur.nav || (state.period === "day" ? state.dayIdx === index.dates.length - 1 : state.monthIdx === index.months.length - 1);
  $("#dotLabel").textContent = state.period === "day" ? "● 実測" : "● 全日";
  $("#dotLabel").className = state.period === "day" ? "" : "c-all";
  const showBase = state.period === "day" || state.showAll;
  $("#dotLabel").hidden = !showBase;
  $("#cmpLegend").hidden = !cmp.label;
  $("#cmpLabel").textContent = cmp.label;

  // 機種タブは、いま出している期間にデータのある機種だけ
  const keys = index.machines.map((m) => m.key).filter((k) => cur.rows.some((r) => r.machine === k));
  if (!keys.includes(state.machine)) state.machine = keys.includes("my_juggler_v") ? "my_juggler_v" : keys[0] || null;
  const grid = state.view === "grid";
  $("#machines").innerHTML = `<button data-k="" class="${grid ? "on" : ""}">一覧</button>` + keys.map((k) => {
    const m = index.machines.find((x) => x.key === k);
    return `<button data-k="${k}" class="${!grid && k === state.machine ? "on" : ""}">${m.name}</button>`;
  }).join("");
  $$("#machines button").forEach((b) => (b.onclick = () => {
    if (b.dataset.k) { state.view = "machine"; state.machine = b.dataset.k; } else state.view = "grid";
    render();
  }));
  // 既定のマイジャグVはタブ列の右のほうにあり、スマホ幅だと画面外に隠れる
  const onTab = $("#machines button.on");
  if (onTab) onTab.scrollIntoView({ block: "nearest", inline: "center" });
  $("#stickyText").innerHTML = stickyHtml();

  const cmpOf = (r) => cmp.rows.find((c) => c.shop === r.shop && c.machine === r.machine);
  const shown = state.period === "day" ? [] : SPLITS.filter(([k]) => state.overlays.has(k));
  const extrasOf = (r) => shown.map(([key, label]) => ({ key, label,
    row: (cur.splits[key] || []).find((c) => c.shop === r.shop && c.machine === r.machine) }));
  if (grid) {
    renderGrid(cur.rows, keys, cmpOf, extrasOf, showBase);
    return;
  }

  // REG の位置が高い店から。位置が出せない店は最後
  const rows = cur.rows.filter((r) => r.machine === state.machine)
    .sort((a, b) => (b.reg.pos ?? -9) - (a.reg.pos ?? -9));
  // その機種が無い店も名前だけ下に出す。出さないと「店ごと載っていない」と誤解される
  // （ロイヤルにはマイジャグVが無く、既定のタブで店が消えて見えた。2026-09-25）
  const missing = index.shops.filter((s) => !rows.some((r) => r.shop === s.id)).map((s) => {
    const other = cur.rows.some((r) => r.shop === s.id);
    return `<article class="shop absent"><header><b>${s.name}</b></header>
  <p>${other ? "この機種は置いていません" : "この期間のデータはありません"}</p></article>`;
  }).join("");
  $("#rows").innerHTML = (rows.length
    ? rows.map((r) => rowHtml(r, cmpOf(r), extrasOf(r), showBase)).join("")
    : `<p class="empty">この条件のデータはありません</p>`) + missing;
  bindTops();
}

function bindTops() {
  $$("details.top10").forEach((el) => {
    el.addEventListener("toggle", () => {
      if (el.open) { openTops.add(el.dataset.shop); fillTop(el); } else openTops.delete(el.dataset.shop);
    });
  });
  refreshTops();
}

function renderGrid(rows, keys, cmpOf, extrasOf, showBase) {
  let card = "";
  if (state.pick) {
    const { shop, machine } = state.pick;
    const r = rows.find((x) => x.shop === shop && x.machine === machine);
    const s = index.shops.find((x) => x.id === shop);
    card = `<div id="pickCard"><p class="pickhead">${machineName(machine)}</p>`
      + (r ? rowHtml(r, cmpOf(r), extrasOf(r), showBase)
           : `<article class="shop absent"><header><b>${s ? s.name : shop}</b></header><p>この期間のデータはありません</p></article>`)
      + `<button class="allshops" data-k="${machine}">この機種を全店で見る ›</button></div>`;
  }
  $("#rows").innerHTML = gridHtml(rows, keys) + card;
  $$("#gridMetric button").forEach((b) => (b.onclick = () => { state.gridMetric = b.dataset.gm; render(); }));
  $$("table.grid td.cell").forEach((td) => (td.onclick = () => {
    const same = state.pick && state.pick.shop === td.dataset.shop && state.pick.machine === td.dataset.k;
    state.pick = same ? null : { shop: td.dataset.shop, machine: td.dataset.k };
    render().then(() => { const c = $("#pickCard"); if (c) c.scrollIntoView({ block: "nearest", behavior: "smooth" }); });
  }));
  const all = $("button.allshops");
  if (all) all.onclick = () => { state.view = "machine"; state.machine = all.dataset.k; render(); };
  bindTops();
}

init();
