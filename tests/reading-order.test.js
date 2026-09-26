const test = require('node:test');
const assert = require('node:assert');
const load = require('./load');

load('src/lib/reading-order.js', 'src/lib/speech-text.js', 'src/lib/pptx.js');

// pptx のスライド XML を作る。box は px 相当の値（1px = 9754 EMU）で、null なら位置を書かない
const E = 9754;
const sp = (ph, box, text) => `<p:sp><p:nvSpPr><p:cNvPr id="1" name="x"/><p:nvPr>${ph}</p:nvPr></p:nvSpPr><p:spPr>${box ? `<a:xfrm><a:off x="${box[0] * E}" y="${box[1] * E}"/><a:ext cx="${box[2] * E}" cy="${box[3] * E}"/></a:xfrm>` : ''}</p:spPr><p:txBody>${text.split('|').map((t) => `<a:p>${t.split('/').map((r, i) => (i ? '<a:br/>' : '') + `<a:r><a:t>${r}</a:t></a:r>`).join('')}</a:p>`).join('')}</p:txBody></p:sp>`;
// eslint-disable-next-line no-undef
const order = (xml, inherited = []) => slideParagraphsInReadingOrder(xml, inherited);

test('タイムライン：日付と説明を列ごとに読む（隣の枠と少し重なっていても列を分ける）', () => {
  const cols = [[60, '2026年10月', '社内説明会の開催'], [360, '2026年11月1日', '操作マニュアルの公開|試験運用の開始'], [650, '2026年12月1日', '本番運用の開始'], [945, '2027年1月以降', '新システム/による運用のみ']];
  const xml = cols.map(([x, d]) => sp('', [x + 20, 350, 300, 40], d)).join('')
    + cols.map(([x, , t]) => sp('', [x, 460, 340, 80], t)).join('')
    + sp('', [60, 50, 420, 70], '導入スケジュール');
  assert.deepStrictEqual(order(xml), [
    '導入スケジュール',
    '2026年10月', '社内説明会の開催',
    '2026年11月1日', '操作マニュアルの公開\n試験運用の開始',
    '2026年12月1日', '本番運用の開始',
    '2027年1月以降', '新システム\nによる運用のみ',
  ]);
});

test('左右 2 段組：段ごとに読み、タイトルのプレースホルダーはレイアウトの位置を使って先頭にする', () => {
  const xml = sp('', [60, 200, 520, 40], '従来の方式') + sp('', [660, 200, 520, 40], '新しい方式')
    + sp('', [60, 260, 520, 200], '手動') + sp('', [660, 260, 520, 300], '自動')
    + sp('<p:ph type="title"/>', null, '比較');
  const layout = [[{ type: 'title', idx: null, box: { x: 60 * E, y: 50 * E, w: 1100 * E, h: 80 * E } }]];
  assert.deepStrictEqual(order(xml, layout), ['比較', '従来の方式', '手動', '新しい方式', '自動']);
});

test('1 段組：重ね順の最後にある見出しを先に読む', () => {
  const xml = sp('', [60, 190, 530, 30], '小見出し') + sp('', [60, 230, 530, 250], '本文') + sp('', [60, 60, 500, 60], '見出し');
  assert.deepStrictEqual(order(xml), ['見出し', '小見出し', '本文']);
});

test('全幅のリード文の下に 3 列', () => {
  const xml = sp('', [60, 150, 1100, 40], 'リード文')
    + [0, 1, 2].map((i) => sp('', [60 + i * 380, 250, 340, 40], `特長${i + 1}`) + sp('', [60 + i * 380, 300, 340, 120], `説明${i + 1}`)).join('');
  assert.deepStrictEqual(order(xml), ['リード文', '特長1', '説明1', '特長2', '説明2', '特長3', '説明3']);
});

test('スライド番号と日付のプレースホルダーは読まない', () => {
  const xml = sp('', [60, 60, 500, 60], '見出し') + sp('<p:ph type="sldNum"/>', [1100, 650, 50, 30], '3') + sp('<p:ph type="dt"/>', [60, 650, 200, 30], '2026/9/27');
  assert.deepStrictEqual(order(xml), ['見出し']);
});
