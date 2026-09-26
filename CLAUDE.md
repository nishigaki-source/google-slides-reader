# スライド音声読み上げ（Chrome 拡張）

「よみあげ for Googleスライド」。Googleスライドの本文とスピーカーノートを `chrome.tts` で読み上げ、読み終えたら次のスライドへ進む。
Chrome ウェブストアで公開する（「ルビふり for Googleスライド」＝ `../rubi` と同じ形式・同じデベロッパーアカウント）。

## 構成

| ファイル | 役割 |
|---|---|
| `manifest.json` | MV3。名前と説明は `_locales/`（ja が既定、en もあり）。content script の読み込み順に意味がある（下の lib → content.js） |
| `src/lib/reading-order.js` | 図形の読み上げ順（行→列。タイムライン・2 段組は列ごと） |
| `src/lib/page-data.js` | ページに埋め込まれたデータ（編集画面の `modelChunk`、/present の `viewerData`）の読み取り |
| `src/lib/pptx.js` | pptx 書き出しの取得と解析（最小限の ZIP リーダー＋正規表現で XML を読む） |
| `src/lib/slides-page.js` | 画面の扱い（表示中のスライド、ページ送り、画面の文字） |
| `src/lib/speech-text.js` | 読み上げ用の整形（文への分割、改行のつなぎ、辞書、強調表示のための位置の対応付け） |
| `src/content/content.js` | スライドのタブで動く。本文とノートの用意、スライド切り替えの通知 |
| `src/sidepanel/` | 操作画面と再生の制御（再生のループはここにある） |
| `src/background/background.js` | サイドパネルの開閉、ショートカットをパネルへ中継 |
| `notes/` | 開発メモ：各段階の検証記録（phase0〜4）と課題一覧（issues.md） |
| `docs/` | GitHub Pages で公開するプライバシーポリシー（`index.html`）。開発メモは置かない |
| `STORE_LISTING.md` | ウェブストアの掲載文・権限の理由・プライバシーへの取り組みの回答 |
| `design/`、`icons/` | アイコンの元画像、ストア用の画像（`design/store/` が元の HTML）、拡張のアイコン |
| `scripts/` | `generate-icons.py`（アイコン）、`render-store-images.mjs`（ストア用画像）、`build-store-zip.mjs`（申請用 zip） |
| `tests/` | `npm test`（node:test）。fixtures は公開サンプル「Baby album」の埋め込みデータ |

## 本文とノートの取り方（優先順）

1. **ページに埋め込まれたデータ**（`page-data.js`）：編集画面ならすぐ読める。スライド数がフィルムストリップより少なければ使わない
2. **保存結果**（`chrome.storage.local` の `deck:v2:<資料ID>`）
3. **pptx の書き出し**（`/presentation/d/<ID>/export/pptx`）：実際の資料で 37〜61 秒かかる。「取り直す」ボタンもこれ
4. 上がそろうまでは**画面の文字**（`slides-page.js` の `domSlideText`）。/present ではノートを `viewerData` から補う

## 落とし穴

- **Googleスライドのページは Trusted Types が有効で `DOMParser` が使えない**。XML は正規表現で読む。
- **編集画面の URL には `?slide=id.X` と `#slide=id.X` の両方がある**。`?` 側は開いた時点の値なので `#` を優先する。つなげて読むと ID が壊れる（実際に起きた）。
- **編集画面の `#pages` には、以前に表示したスライドも非表示のまま残る**。先頭の要素ではなく、面積が最大のものが表示中。
- 編集画面から開いたスライドショーは同一オリジンの `iframe.punch-present-iframe` の中。トップフレームから読める（`all_frames` は不要）。
- ページ送りは `ArrowRight` / `ArrowLeft` の KeyboardEvent を発生させる。
- pptx の中の図形は重ね順で並ぶ。見出しが最後に来ることがあるので、位置で並べ替える。
- 編集画面の SVG は単語ごとに `<text>` が分かれ、単語の間の空白が失われている。/present の `g[id^="a11y-"]` の `aria-label` には空白付きの全文がある。
- `page-data.js` と画面の要素名は Google の内部形式。変わったら null を返して pptx に切り替わるようにしてある。
- 音声は端末内のもの（Kyoko など）を既定にする。`Google 日本語`（オンライン）は `word` イベントも一時停止も無い。
- `word` イベントの `charIndex` は、辞書で置き換えた後の文の位置。画面の強調には `applyDictionaryMapped` の `toDisplay` で戻す。
- 読み上げ順や取り出し方を変えて保存結果の形が変わるときは、`content.js` の `DECK_FORMAT` を上げる。

## 開発

- 拡張の読み込み：`chrome://extensions` →「パッケージ化されていない拡張機能を読み込む」でこのフォルダ。変更後は拡張の ↻ とスライドのタブの再読み込み。
- テスト：`npm test`
- 申請用 zip：`npm run build:store-zip`（`google-slides-reader.zip`。manifest が参照するファイルの有無も確かめる）。ストア用画像：`npm run store-images`、アイコン：`npm run icons`
- バージョンを上げるときは `manifest.json` の `version` を上げてから zip を作る
- 公開リポジトリなので、利用者の資料の ID や内容をメモやテストに書かない
- Claude の組み込みブラウザでは拡張を読み込めない。画面の構造の調査は、公開サンプル（`1EAYk18WDjIG-zp_0vLm3CsfQh_i8eXc67Jo2O9C6Vuc`）で JavaScript を実行して行う。拡張としての動作確認は利用者の Chrome で行う。
