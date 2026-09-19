# 集計値を書き出して公開する。取り込みが済んだ日に1回叩く。
# export-public は禁止項目があると何も書かずに止まる。そのときは push もしない。
$ErrorActionPreference = "Stop"
$site = $PSScriptRoot
$app = "C:\Users\Owner\juggler-analyzer-paste"

& "$app\.venv\Scripts\python.exe" -m juggler.cli export-public --out "$site\data"
if ($LASTEXITCODE -ne 0) { Write-Host "書き出しに失敗したので公開しません"; exit 1 }

git -C $site add -A
$changed = git -C $site status --porcelain
if (-not $changed) { Write-Host "変更なし（公開済みの状態と同じ）"; exit 0 }
git -C $site commit -q -m ("データ更新 " + (Get-Date -Format "yyyy-MM-dd HH:mm"))
git -C $site push
Write-Host "公開しました。数分で反映されます"
