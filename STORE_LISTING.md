# Chrome ウェブストア掲載文

デベロッパーダッシュボード（<https://chrome.google.com/webstore/devconsole>）の各項目に、
そのままコピー＆ペーストして使える文面。形式は「ルビふり for Googleスライド」（`../rubi/STORE_LISTING.md`）にそろえている。
提出の操作はデベロッパーダッシュボードで利用者自身が行う。

## 基本情報

- **拡張機能名**：よみあげ for Googleスライド（`manifest.json` の `__MSG_extName__` から自動で入る。英語の環境では「Yomiage for Google Slides」）
- **カテゴリ**：生産性（Productivity）。ルビふりと同じ。「アクセシビリティ」も当てはまる
- **言語**：日本語（主）。英語の掲載文も下に用意した（ストアの「追加言語」で登録できる）。ただし拡張の画面は日本語のみ
- **公開範囲**：一般公開（ルビふりと同じ）
- **プライバシーポリシーURL**：<https://nishigaki-source.github.io/google-slides-reader/>（`docs/index.html` を GitHub Pages で公開済み）

## 概要（短い説明、132文字以内）

### 日本語
```
Googleスライドの本文とスピーカーノートを音声で読み上げ、読み終えたら次のスライドへ自動で進みます。読み方の辞書も登録できます。
```
（61文字）

### English
```
Reads Google Slides text and speaker notes aloud, then moves to the next slide automatically. Add your own reading dictionary.
```
（126 characters）

## 詳細説明

### 日本語
```
「よみあげ for Googleスライド」は、Googleスライドで開いているプレゼンテーションの本文とスピーカーノートを
音声で読み上げる拡張機能です。1枚読み終えると次のスライドへ自動で進むので、資料の確認や発表練習、
読み上げによる校正に使えます。

■ できること
・本文とスピーカーノートを読み上げ（「本文だけ」「ノートだけ」も選べます）
・読み終えたら次のスライドへ自動で進み、最後のスライドで止まります
・編集画面でも、スライドショーでも使えます
・見出し→本文の順、タイムラインや2段組は列ごとなど、スライドの見た目の順に読み上げます
・読んでいる文と語をサイドパネルで強調表示
・読み方の辞書で、略語や固有名詞の読み方を登録（例：PWA → ピーダブリューエー）
・キーボードショートカットで再生・一時停止・前後のスライドへの移動（全画面のスライドショー中も使えます）
・音声（パソコンに入っている日本語の声など）と速度を選べます
・操作パネルはスライドの横（Chrome のサイドパネル）に表示されるので、スライドを隠しません

■ こんな方におすすめ
・作ったスライドを耳で確認したい方（誤字や言い回しの違和感に気づきやすくなります）
・スピーカーノートを読み上げさせて、発表の流れを確認したい方
・画面の文字を目で追うのがつらいときに、スライドを聞いて理解したい方

■ 権限と情報の取り扱い
・Googleスライドへのアクセス：開いているGoogleスライドのページでだけ動作し、そのプレゼンテーションの文字を読み取ります
・読み取った文字・設定・読み方の辞書は、ご自身のパソコンのChromeの中にだけ保存され、開発者のサーバーには一切送信されません
・オンラインの音声（「Google 日本語」など）を選んだ場合は、音声を作るためにChromeが文字をGoogleの音声合成サービスへ送ります

詳しくはプライバシーポリシーをご覧ください：https://nishigaki-source.github.io/google-slides-reader/
```

### English
```
"Yomiage for Google Slides" reads the slide text and speaker notes of the Google Slides presentation you have open aloud.
When it finishes a slide it moves to the next one automatically, so you can review a deck by ear, rehearse a talk,
or proofread by listening. (The extension's interface is in Japanese.)

■ Features
- Reads slide text and speaker notes (or only one of them)
- Moves to the next slide automatically and stops at the last slide
- Works in the editor and in slideshow mode
- Reads in visual order: title first, and column by column for timelines and two-column layouts
- Highlights the sentence and word being read in the side panel
- Reading dictionary for abbreviations and proper nouns (e.g. PWA → ピーダブリューエー)
- Keyboard shortcuts for play/pause and previous/next slide (they also work in full-screen slideshows)
- Choose the voice (such as voices installed on your computer) and speed
- The controls open in Chrome's side panel next to your slide, so nothing covers the slide

■ Who this is for
- Anyone who wants to check their slides by ear (it helps you catch typos and awkward phrasing)
- Anyone who wants to hear their speaker notes to rehearse a presentation
- Anyone who finds it easier to listen to slides than to read them

■ Permissions and data
- Google Slides access: it only runs on the Google Slides pages you open, and reads the text of that presentation
- The text it reads, your settings, and your reading dictionary are stored only in Chrome on your computer and are never sent to a developer-run server
- If you choose an online voice (such as "Google 日本語"), Chrome sends the text to Google's speech service to generate the audio

See the privacy policy for details: https://nishigaki-source.github.io/google-slides-reader/
```

## 単一の目的（Single purpose）

### 日本語
```
Googleスライドのプレゼンテーションの本文とスピーカーノートを、音声で読み上げること。
```

### English
```
To read the slide text and speaker notes of Google Slides presentations aloud.
```

## 権限の使用理由

| 権限 | 理由（日本語） | Reason (English) |
|---|---|---|
| `tts` | スライドの本文とスピーカーノートを、Chromeの音声合成で読み上げるため | To read slide text and speaker notes aloud with Chrome's text-to-speech |
| `sidePanel` | 操作パネル（再生・停止・設定）を Chrome のサイドパネル（スライドの横）に表示するため | To show the controls (play, stop, settings) in Chrome's side panel next to the slide |
| `storage` | 読み上げの設定、読み方の辞書、読み取ったスライドの文字（次回すぐ読むため）を、利用者のパソコンのChromeに保存するため | To store reading settings, the reading dictionary, and the slide text already read (so it can be read immediately next time) locally in Chrome |
| ホスト権限（`https://docs.google.com/presentation/*`） | 開いているGoogleスライドのページで、スライドの文字の読み取り、表示中のスライドの判別、次のスライドへの移動を行うため | To read slide text, detect the current slide, and move to the next slide on the Google Slides pages the user opens |

- **リモートコードの使用**：いいえ（すべてのコードは拡張に含まれている。外部のスクリプトは読み込まない）

## プライバシーへの取り組み（データの使用）

デベロッパーダッシュボードの「プライバシーへの取り組み」タブの回答。

- **収集・使用するデータの種類**：「ウェブサイトのコンテンツ」だけにチェック（開いているスライドの本文とスピーカーノートの文字。読み上げと、次回すぐ読むためのパソコン内への保存にだけ使う）
  - 個人を特定できる情報、健康、財務、認証情報、個人的な通信、位置情報、ウェブ履歴、ユーザーのアクティビティは、いずれも扱わない
- **3つの宣誓**：すべてにチェック
  - 承認されている用途以外で、ユーザーデータを第三者に販売、転送しない
  - アイテムの単一の目的と関係のない目的で、ユーザーデータを使用、転送しない
  - 信用力の判断や融資目的で、ユーザーデータを使用、転送しない

## スクリーンショット・画像

`npm run store-images` で書き出せる（ヘッドレス Chrome を使用）。サイドパネルは本物の画面を、撮影用の仮のデータで表示している。
左側の Googleスライドの画面は模したもの。実際の画面のスクリーンショットに差し替えてもよい。

1. `design/store-screenshot-1.png`（1280×800）— 再生中。読んでいる文と語の強調、本文とノートの一覧
2. `design/store-screenshot-2.png`（1280×800）— 設定、読み方の辞書、キーボードショートカット
- プロモーションタイル（小）：`design/promo-tile-small-440x280.png`
- マーキー プロモーションタイル：`design/promo-tile-marquee-1400x560.png`
- アイコン（ストア用 128×128）：`icons/icon128.png`（元画像は `design/icon-master-512.png`、`npm run icons` で作り直せる）

## 提出・公開のチェックリスト

- [x] Chrome ウェブストア デベロッパーアカウント登録（ルビふりと同じアカウント。拡張機能の上限は 3 個のうち 2 個使用中）
- [x] リポジトリを公開し、GitHub Pages（`main` の `/docs`）でプライバシーポリシーを公開（2026-09-27）
- [ ] `npm run build:store-zip` で作った `google-slides-reader.zip` をアップロード（新しいアイテム）
- [ ] 掲載文・カテゴリ・スクリーンショット・プロモーションタイル・プライバシーポリシーURLを入力
- [ ] 権限の使用理由・単一の目的・プライバシーへの取り組みを入力
- [ ] 公開範囲を「一般公開」にして審査に提出
- [ ] 審査通過・公開（拡張機能IDをここに記録する）
