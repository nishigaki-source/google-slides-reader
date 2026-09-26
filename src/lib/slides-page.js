// Googleスライドの画面（編集画面・/present・編集画面から開いたスライドショー）を扱う。
// 画面の内部構造に依存する処理はこのファイルに閉じ込める。

globalThis.SlideReader = globalThis.SlideReader || {};

// 編集画面の SVG は単語・行ごとに <text> が分かれ、間の空白が失われている。
// 英数字どうしが隣り合うときだけ空白を補う（日本語は詰めてつなぐ）。
function joinFragments(parts) {
  let s = '';
  for (const part of parts) {
    const t = part.trim();
    if (!t) continue;
    if (s && /[A-Za-z0-9.,!?;:)\]'"]$/.test(s) && /^[A-Za-z0-9(\['"]/.test(t)) s += ' ';
    s += t;
  }
  return s;
}

globalThis.SlideReader.page = {
  presentationId() {
    return location.pathname.match(/\/presentation\/d\/([^/]+)/)?.[1] ?? null;
  },

  // 編集画面から開いたスライドショーは同一オリジンの iframe に描画される
  presentDocument() {
    const frame = document.querySelector('iframe.punch-present-iframe');
    try {
      if (frame?.contentDocument?.querySelector('.punch-viewer-svgpage-svgcontainer')) return frame.contentDocument;
    } catch { /* 別オリジンなら無視 */ }
    if (document.querySelector('.punch-viewer-svgpage-svgcontainer')) return document; // /present を直接開いた場合
    return null;
  },

  mode() {
    return this.presentDocument() ? 'present' : 'edit';
  },

  currentSlideId() {
    const doc = this.presentDocument();
    if (doc) {
      const id = doc.querySelector('.punch-viewer-svgpage-svgcontainer svg g[id]')?.id;
      if (id) return id;
    }
    // 編集画面では URL の #slide=id.<ID> がスライド選択に追従する（?slide= は開いた時点の値なので後回し）
    const m = location.hash.match(/slide=id\.([^&#?]+)/) ?? location.search.match(/slide=id\.([^&#?]+)/);
    if (m) return decodeURIComponent(m[1]);
    // URL に無い場合は、メイン領域で実際に表示されている（面積が最大の）"editor-<ID>" を使う。
    // 以前に表示したスライドも非表示のまま DOM に残るため、先頭の要素では判定できない
    let best = null;
    let bestArea = 0;
    for (const g of document.querySelectorAll('#pages svg g[id^="editor-"]')) {
      if (!/^editor-[^-]+$/.test(g.id)) continue;
      const r = g.getBoundingClientRect();
      if (r.width * r.height > bestArea) { bestArea = r.width * r.height; best = g.id.slice('editor-'.length); }
    }
    return best;
  },

  // 何枚目か（0 始まり）。ID で対応付けられないときの予備に使う
  currentSlideIndex() {
    const label = this.positionLabel();
    const pm = label?.match(/(\d+)\s*\/\s*\d+/);
    if (pm) return Number(pm[1]) - 1;
    const id = this.currentSlideId();
    if (!id) return null;
    for (const g of document.querySelectorAll('g[id^="filmstrip-slide-"]')) {
      const fm = g.id.match(/^filmstrip-slide-(\d+)-(.+)$/);
      if (fm && fm[2] === id) return Number(fm[1]);
    }
    return null;
  },

  // プレゼン中の「スライド 2/5」表記（本文が取れない場合の位置確認用）
  positionLabel() {
    return this.presentDocument()?.querySelector('.punch-viewer-svgpage-a11yelement')?.getAttribute('aria-label') ?? null;
  },

  slideCount() {
    const pm = this.positionLabel()?.match(/\d+\s*\/\s*(\d+)/);
    if (pm) return Number(pm[1]);
    return document.querySelectorAll('.punch-filmstrip-thumbnail').length || null;
  },

  // pptx の取得が終わるまでのつなぎとして、表示中のスライドの文字を画面から読む（図形ごとに 1 つの文字列）。
  // 位置の順に並べる（reading-order.js）。ノートは編集画面でのみ取れる。
  domSlideText() {
    // pptx と同じ並べ方（reading-order.js）。表示されていない要素は除く
    const byPosition = (items) => globalThis.SlideReader.readingOrder(
      items
        .map((it) => ({ ...it, r: it.el.getBoundingClientRect() }))
        .filter((it) => it.r.width > 0 && it.r.height > 0)
        .map((it) => ({ ...it, x: it.r.left, y: it.r.top, w: it.r.width, h: it.r.height })),
      4,
    );

    const doc = this.presentDocument();
    if (doc) {
      // スライドショーでは図形ごとに、文章全体（空白入り）が aria-label に入っている
      const groups = [...doc.querySelectorAll('.punch-viewer-svgpage-svgcontainer svg g[id^="a11y-"][aria-label]')];
      const body = byPosition(groups.map((el) => ({ el })))
        .map((it) => it.el.getAttribute('aria-label').trim())
        .filter(Boolean);
      return { body, notes: [] };
    }

    const id = this.currentSlideId();
    const pageEl = id && document.getElementById(`editor-${id}`);
    const body = [];
    if (pageEl) {
      // 図形ごとに段落をまとめ、図形の位置で並べる
      const shapes = new Map();
      for (const p of pageEl.querySelectorAll('g[id*="-paragraph-"]')) {
        const shapeId = p.id.replace(/-paragraph-\d+$/, '');
        if (!shapes.has(shapeId)) shapes.set(shapeId, []);
        shapes.get(shapeId).push(p);
      }
      const items = [...shapes].map(([shapeId, paras]) => ({ el: document.getElementById(shapeId) ?? paras[0], paras }));
      for (const it of byPosition(items)) {
        const text = it.paras
          .map((p) => joinFragments([...p.querySelectorAll('text')].map((t) => t.textContent)))
          .filter(Boolean)
          .join('\n');
        if (text) body.push(text);
      }
    }
    const notesText = [...document.querySelectorAll('#speakernotes-workspace g[id*="-paragraph-"]')]
      .filter((p) => p.getBoundingClientRect().width > 0)
      .map((p) => joinFragments([...p.querySelectorAll('text')].map((t) => t.textContent)))
      .filter(Boolean)
      .join('\n');
    return { body, notes: notesText ? [notesText] : [] };
  },

  pressKey(key, keyCode) {
    const doc = this.presentDocument() ?? document;
    const target = doc.activeElement || doc.body;
    for (const type of ['keydown', 'keyup']) {
      target.dispatchEvent(new KeyboardEvent(type, { key, code: key, keyCode, which: keyCode, bubbles: true }));
    }
  },

  next() { this.pressKey('ArrowRight', 39); },
  prev() { this.pressKey('ArrowLeft', 37); },
};
