# 架空路線図メーカー

架空鉄道の路線図エディタ兼シミュレーターです。iPhone（Safari）と Windows PC（Chrome / Edge）のブラウザで動く静的サイトで、GitHub Pages で公開しています。

- 公開URL：https://miyoshigo-cpu.github.io/rail-map-maker/
- 仕様：[SPEC.md](SPEC.md)

> 現在はフェーズ1（路線図エディタの土台）を作っているところです。

## 使い方

1. 公開URLを開き、「新しいプロジェクト」を作ります。
2. 「駅を置く」で画面をタップして駅を置き、「路線を引く」で駅を順にタップして路線を作ります。
3. データはブラウザの中（IndexedDB）に自動で保存されます。ときどき「書き出す」で JSON ファイルにバックアップしてください。

### iPhone で使うときの注意

- Safari の「共有」→「ホーム画面に追加」で、アプリのように起動できます。
- ホーム画面に追加したアプリと Safari は、保存場所が別々です。移すときは JSON で書き出して、もう一方で読み込んでください。
- Safari はしばらく開かないサイトのデータを消すことがあります。定期的に JSON で書き出してください。

## ローカルで動かす（開発用）

ES Modules を使っているため、`index.html` をダブルクリックして開いても動きません。ローカルサーバーを起動してください。

Windows（PowerShell）で、このフォルダに移動してから：

```
py tools/serve.py
```

ブラウザで http://localhost:8000/ を開きます。止めるときは Ctrl+C です。

- `tools/serve.py` は `python -m http.server` と同じですが、ブラウザにキャッシュさせないので、ファイルを編集したあと再読み込みするだけで反映されます。
- このPCでは `python` コマンドが使えないため `py` を使っています（`py -m http.server 8000` でも動きますが、古いファイルが表示されることがあります）。

### テスト

- ブラウザ：サーバーを起動して http://localhost:8000/tests/ を開く
- Node.js：`npm test`

### 補助スクリプト

- `node tools/check-i18n.js`：画面の文言がカタログ（`js/i18n/`）を通っているかを検査します。
- `node tools/make-icons.js`：アイコン画像（`icons/`）を作り直します。

## 公開のしかた（GitHub Pages）

1. main ブランチに push します。
2. GitHub のリポジトリの Settings → Pages で、Source を「Deploy from a branch」、Branch を「main」「/ (root)」にして保存します（最初の1回だけ）。
3. 数分後に公開URLで開けるようになります。

## 作りの概要

- ビルド不要。HTML・CSS・JavaScript（ES Modules）だけで、外部ライブラリは使いません。
- `js/core/`：画面に依存しない処理（テスト対象）
- `js/render/`：路線図の描画
- `js/ui/`：画面と操作
- `js/storage/`：保存とバックアップ
- `js/i18n/`：画面の文言（日本語カタログ）
- `js/core/regions/`：地域パック（日本の鉄道の決まりごと）
