// 図形の読み上げ順を決める。pptx（EMU 単位）と画面（px 単位）の両方で使う。
//
// 1. 高さの重なりで「行」に分け、各行を横の位置で「列」に分ける
// 2. 続く行が同じ列の並び（列数が同じで、各列の横の範囲が重なる）なら 1 つの行にまとめる
//    → タイムラインの「日付の行」と「説明の行」や、左右 2 段組の「見出し」と「本文」がまとまる
// 3. 列が 2 つ以上ある行は列ごとに上から読み、それ以外は上→下・左→右で読む
//
// 既知の制約：カードを格子状に並べたスライドも列ごとに読む（1→3→2→4 の順になる）。

globalThis.SlideReader = globalThis.SlideReader || {};

(() => {
  // pos 方向に重ならないまとまりに分ける。テキストボックスは文字より大きめに作られ、
  // 隣と少し重なりがちなので、重なりが小さい（tol 以下、または狭い方の大きさの 25% 以下）なら別とみなす
  function splitBy(items, pos, size, tol) {
    const groups = [];
    let end = -Infinity;
    let lastSize = 0;
    for (const it of [...items].sort((a, b) => a[pos] - b[pos])) {
      const overlap = end - it[pos];
      if (!groups.length || overlap <= Math.max(tol, 0.25 * Math.min(it[size], lastSize))) {
        groups.push([it]);
        end = it[pos] + it[size];
      } else {
        groups[groups.length - 1].push(it);
        end = Math.max(end, it[pos] + it[size]);
      }
      lastSize = it[size];
    }
    return groups;
  }

  const range = (col) => ({ min: Math.min(...col.map((it) => it.x)), max: Math.max(...col.map((it) => it.x + it.w)) });
  const overlaps = (a, b) => Math.min(a.max, b.max) > Math.max(a.min, b.min);
  const topLeft = (a, b) => a.y - b.y || a.x - b.x;

  function order(items, tol) {
    if (items.length <= 1) return items;
    const bands = [];
    for (const rowItems of splitBy(items, 'y', 'h', tol)) {
      const band = { items: rowItems, cols: splitBy(rowItems, 'x', 'w', tol) };
      const prev = bands[bands.length - 1];
      if (prev && prev.cols.length >= 2 && band.cols.length === prev.cols.length
        && band.cols.every((c, i) => overlaps(range(c), range(prev.cols[i])))) {
        const all = [...prev.items, ...band.items];
        const cols = splitBy(all, 'x', 'w', tol);
        if (cols.length === prev.cols.length) {
          bands[bands.length - 1] = { items: all, cols };
          continue;
        }
      }
      bands.push(band);
    }
    return bands.flatMap((b) => (b.cols.length >= 2
      ? b.cols.flatMap((c) => order(c, tol))
      : [...b.items].sort(topLeft)));
  }

  // items: { x, y, w, h, title?, pos? }。位置が分からない図形（x が null）は最後に元の順で並べる
  globalThis.SlideReader.readingOrder = function readingOrder(items, tol) {
    const titles = items.filter((it) => it.title).sort((a, b) => (a.x == null || b.x == null ? 0 : topLeft(a, b)));
    const rest = items.filter((it) => !it.title);
    const placed = rest.filter((it) => it.x != null);
    const unplaced = rest.filter((it) => it.x == null).sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0));
    return [...titles, ...order(placed, tol), ...unplaced];
  };
})();
