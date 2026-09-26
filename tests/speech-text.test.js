const test = require('node:test');
const assert = require('node:assert');
const load = require('./load');

const { speech } = load('src/lib/speech-text.js');

test('文末で分け、箇条書きの記号・絵文字を消し、URL は 1 回だけ「URL」と読む', () => {
  assert.deepStrictEqual(
    speech.toUtterances(['・資料を共有します。これにより安定します。', '● 詳細は https://example.com を参照 🎉', 'Image Sources:\nhttp://a.com/x\nhttp://b.com/y']),
    ['資料を共有します。', 'これにより安定します。', '詳細は URL を参照', 'Image Sources:', 'URL'],
  );
});

test('図形の中で文の途中の改行はつなぎ、別の項目や別の図形はつながない', () => {
  assert.deepStrictEqual(speech.toUtterances(['新システム\nによる運用のみ']), ['新システムによる運用のみ']);
  assert.deepStrictEqual(speech.toUtterances(['操作マニュアルの公開\n試験運用の開始']), ['操作マニュアルの公開', '試験運用の開始']);
  assert.deepStrictEqual(speech.toUtterances(['主な変更点は、\n同期の停止です。']), ['主な変更点は、同期の停止です。']);
  assert.deepStrictEqual(speech.toUtterances(['・項目A\n・項目B']), ['項目A', '項目B']);
  assert.deepStrictEqual(speech.toUtterances(['My first fast\nfood restaurant.']), ['My first fast food restaurant.']);
  assert.deepStrictEqual(speech.toUtterances(['概要', 'これにより安定します。']), ['概要', 'これにより安定します。']);
});

test('200 文字を超える文は読点で分ける', () => {
  const parts = speech.toUtterances([`${'あ'.repeat(150)}、${'い'.repeat(100)}`]);
  assert.strictEqual(parts.length, 2);
  assert.ok(parts.every((p) => p.length <= 200));
});

test('辞書：長い表記を優先し、二重に置き換えず、同じ表記は上の行を使う', () => {
  const dict = speech.buildDictionary([
    { from: 'PWA', to: 'パワー' },
    { from: '', to: '空の行' },
    { from: ' Google ', to: 'グーグル' },
    { from: 'Google ドキュメント', to: 'グーグルドキュメント' },
    { from: 'パワー', to: 'ちから' },
    { from: 'PWA', to: 'ピーダブリューエー' },
  ]);
  assert.strictEqual(speech.applyDictionary('Google ドキュメントの PWA と Google', dict), 'グーグルドキュメントの パワー と グーグル');
});

test('辞書：旧形式（表記=読み の文字列）から移す', () => {
  assert.deepStrictEqual(speech.parseDictionaryText('PWA＝パワー\n\nSaaS=サース\n区切りなし'), [{ from: 'PWA', to: 'パワー' }, { from: 'SaaS', to: 'サース' }]);
});

test('強調表示：辞書で置き換えた文の位置を、元の文の位置に戻す', () => {
  const dict = speech.buildDictionary([{ from: 'PWA', to: 'ピーダブリューエー' }, { from: 'Google', to: 'グーグル' }]);
  const text = 'PWA を使った Google ドキュメント';
  const { spoken, toDisplay } = speech.applyDictionaryMapped(text, dict);
  assert.strictEqual(spoken, 'ピーダブリューエー を使った グーグル ドキュメント');
  const show = (start, end) => { const [s, e] = toDisplay(start, end); return text.slice(s, e); };
  assert.strictEqual(show(0, 9), 'PWA'); // 置き換えた語全体
  assert.strictEqual(show(3, 5), 'PWA'); // 置き換えた語の途中は、語全体に広げる
  assert.strictEqual(show(10, 13), 'を使っ'); // 置き換えていない部分はそのまま
  assert.strictEqual(show(15, 19), 'Google');
  assert.strictEqual(show(20, 26), 'ドキュメント');
});

test('強調表示：辞書が空なら位置はそのまま', () => {
  const { spoken, toDisplay } = speech.applyDictionaryMapped('資料を共有します。', []);
  assert.strictEqual(spoken, '資料を共有します。');
  assert.deepStrictEqual(toDisplay(3, 5), [3, 5]);
});

test('強調表示：語の長さが届かないときは単語の区切りで語の終わりを求める', () => {
  const text = 'スライドの文字を読み上げる';
  assert.strictEqual(text.slice(0, speech.wordEnd(text, 0, 0)), 'スライド');
  assert.strictEqual(speech.wordEnd(text, 0, 2), 2); // 長さが届けばそれを使う
  assert.strictEqual(speech.wordEnd('Hello world', 6), 11);
});
