# ジャグラー 店くらべ（公開サイト）

見るだけのサイト。データは `data/` の JSON だけで、取り込みアプリ
（`C:\Users\Owner\juggler-analyzer-paste`）の `juggler export-public` が書く。

設計書: 取り込みアプリ側の `docs/superpowers/specs/2026-09-19-public-site-design.md`

## 毎日
1. 取り込みアプリで前日ぶんを取り込む
2. `publish.ps1` を実行（書き出し → コミット → push）

## ここに無いもの
台番号・台ごとの数値・画像・内部の店ID。`export-public` は禁止項目を検査し、
1つでもあれば何も書かない。

## ローカルで見る
```
python -m http.server 8765 --directory C:\Users\Owner\juggler-public-site
```
を実行して http://localhost:8765/ を開く。
