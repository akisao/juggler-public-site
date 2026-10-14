// AIで分析する（ai.html）。説明書の後半（機種の公表値・店の特定日）は index.json から作る。
// 手で書くと、機種や店が増えたときに表と説明書が食い違うため（2026-10-15）
"use strict";

const GUIDE_HEAD = `これは「ペカジャグ観測所」が公開している、北海道苫小牧のホールのジャグラーシリーズ（20円スロット）の日ごとの集計表です。
1行 = 1日 × 1店 × 1機種。台ごとの値ではなく、その店のその機種の全台を合計した値です。

【列の意味】
- 日付・曜日
- 日の区分: 平日／土曜／日曜／祝日。土日に重なった祝日は土曜・日曜に入れています
- 特定日: その店が特別な日としている日なら「はい」（店ごとの決まりは下に）
- 店・機種・台数
- 総回転数・BIG回数・REG回数: 全台の合計
- BIG確率分母・REG確率分母・合算確率分母: 総回転数 ÷ 回数（例: 150.2 なら 1/150.2）。合算 = BIG + REG
- BIG目盛り・REG目盛り・合算目盛り: 実測の確率を、メーカー公表値の設定1〜6の目盛りに置いた位置。
  1.0 = 設定1の確率ちょうど、6.0 = 設定6の確率ちょうど。設定と設定の間は直線で按分。
  設定1より悪ければ 1 未満（マイナスもある）、設定6より良ければ 6 を超えます
- 合算目盛り下限・合算目盛り上限: 合算目盛りの95%の幅。回転数が少ないほど広くなります

【分析するときの注意】
- 目盛りは「店×機種の全台の平均がどのあたりか」の目安で、設定そのものではありません
- 複数日・複数機種をまとめるときは、目盛りを単純に平均しないでください。
  総回転数とBIG・REG回数を足してから確率を出し直し、下の公表値の目盛りに置き直すのが正しい方法です
- 回転数の少ない行はブレが大きいので、回転数で重みを付けるか、95%の幅を見てください
- BIG は設定による差がとても小さいので、設定の傾向は主に REG と合算で見ます
- 取れなかった日・機種は行がありません（0 ではありません）`;

const SETTINGS_LABEL = "設定1〜6";
// 「コピーしました」を見せておく時間
const COPIED_MS = 2000;

function machineLines(machines) {
  return machines.map(m => {
    const big = m.settings.map(s => s.big).join("／");
    const reg = m.settings.map(s => s.reg).join("／");
    const comb = m.settings.map(s => s.combined ?? "-").join("／");
    return `- ${m.name}: BIG 1/${big}　REG 1/${reg}　合算 1/${comb}`;
  });
}

function specialText(sd) {
  const parts = [];
  if (sd.digits && sd.digits.length) parts.push(sd.digits.map(d => `${d}のつく日`).join("・"));
  if (sd.month_day_match) parts.push("月と日が同じ日（9/9 など）");
  return parts.length ? parts.join("、") : "なし";
}

function buildGuide(idx) {
  return [
    GUIDE_HEAD,
    "",
    `【期間】${idx.first_date} 〜 ${idx.last_date}（${idx.days}日ぶん）`,
    "",
    `【メーカー公表値（${SETTINGS_LABEL}の順。出典は北電子の製品ページ）】`,
    ...machineLines(idx.machines),
    "",
    "【店ごとの特定日】",
    ...idx.shops.map(s => `- ${s.name}: ${specialText(s.special_days)}`),
  ].join("\n");
}

async function copyText(text, btn) {
  const label = btn.textContent;
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = "コピーしました";
  } catch {
    btn.textContent = "コピーできませんでした（長押しで選んでください）";
  }
  setTimeout(() => { btn.textContent = label; }, COPIED_MS);
}

async function main() {
  const guide = document.getElementById("guide");
  try {
    const res = await fetch("data/index.json", { cache: "no-cache" });
    const idx = await res.json();
    guide.textContent = buildGuide(idx);
    document.getElementById("meta").textContent =
      `${idx.first_date} 〜 ${idx.last_date}・${idx.shops.length}店・毎晩更新`;
  } catch {
    guide.textContent = GUIDE_HEAD;
  }
  document.querySelector("button.copy").addEventListener("click", e => {
    copyText(guide.textContent, e.currentTarget);
  });
  for (const li of document.querySelectorAll("#asks li")) {
    li.addEventListener("click", () => {
      navigator.clipboard.writeText(li.textContent).then(() => {
        li.classList.add("copied");
        setTimeout(() => li.classList.remove("copied"), COPIED_MS);
      }, () => {});
    });
  }
}

main();
