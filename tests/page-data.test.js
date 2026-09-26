const test = require('node:test');
const assert = require('node:assert');
const load = require('./load');

const { pageData } = load('src/lib/reading-order.js', 'src/lib/page-data.js');

// Google 公式の公開サンプル「Baby album」の編集画面・/present に埋め込まれていたデータ（2026-09-27 取得）
test('編集画面のデータから、スライドの順・本文・ノートを取り出す', () => {
  const deck = pageData.deckFromModel(load.fixture('sample-edit-scripts.json'));
  assert.deepStrictEqual(deck.map((s) => s.objectId), ['ge63a4b4_1_0', 'ge63a4b4_1_9', 'ge63a4b4_1_23', 'ge63a4b4_1_35', 'ge63a4b4_1_43']);
  assert.deepStrictEqual(deck[0].body, ['{Name Here}', 'Baby Album']);
  assert.deepStrictEqual(deck[1].body, ['Bath time is so much fun!', 'Look at what Granny got me for my birthday.', 'My first fast\nfood restaurant with Auntie.']);
  assert.match(deck[0].notes[0], /^Image Sources:\nhttp:\/\/www\.flickr\.com\//);
  assert.deepStrictEqual(deck.slice(1).map((s) => s.notes), [[], [], [], []]);
});

test('/present のデータから、スライドごとのノートを取り出す', () => {
  const notes = pageData.notesFromViewer(load.fixture('sample-present-scripts.json'));
  assert.deepStrictEqual([...notes.keys()], ['ge63a4b4_1_0', 'ge63a4b4_1_9', 'ge63a4b4_1_23', 'ge63a4b4_1_35', 'ge63a4b4_1_43']);
  assert.match(notes.get('ge63a4b4_1_0'), /^Image Sources:\nhttp:\/\/www\.flickr\.com\//);
  assert.strictEqual(notes.get('ge63a4b4_1_9'), '');
});

test('データが無い・壊れているときは null を返す', () => {
  assert.strictEqual(pageData.deckFromModel(['var x = 1;']), null);
  assert.strictEqual(pageData.deckFromModel(['var modelChunk = {broken; var modelChunkParseEnd']), null);
  assert.strictEqual(pageData.notesFromViewer(['var viewerData = {docData: [1, 2']), null);
});
