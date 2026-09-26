# よみあげ for Googleスライド

Googleスライドの本文とスピーカーノートを音声で読み上げ、読み終えたら次のスライドへ自動で進む Chrome 拡張機能です。

- 編集画面でもスライドショーでも使えます
- 見出し→本文、タイムラインや 2 段組は列ごとなど、スライドの見た目の順に読み上げます
- 読んでいる文と語をサイドパネルで強調表示します
- 読み方の辞書、キーボードショートカット、音声と速度の選択

プライバシーポリシー：<https://nishigaki-source.github.io/google-slides-reader/>

## 開発

- 拡張の読み込み：`chrome://extensions` →「デベロッパー モード」→「パッケージ化されていない拡張機能を読み込む」でこのフォルダを選ぶ
- テスト：`npm test`
- 申請用 zip：`npm run build:store-zip`
- 仕組みと注意点は [CLAUDE.md](CLAUDE.md)、開発の記録は [notes/](notes/) を参照
