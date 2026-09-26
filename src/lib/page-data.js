// Googleスライドのページに埋め込まれたデータから、本文とノートを取り出す。
// pptx の書き出し（数十秒かかる）を待たずに、ページを開いた時点ですぐ使える。
//
// - 編集画面：<script> 内の `var modelChunk = {...}` に、資料の編集コマンドの列が入っている
//     [12, ページID, 何枚目, 種類(0=スライド,1=レイアウト,2=マスター), …]
//     [3, 図形ID, 図形の種類, [sx, shy, shx, sy, tx, ty], [属性のキーと値の並び], 親(ページIDまたはグループID)]
//     [15, 図形ID, セル(表でなければ null), 挿入位置, 文字]   … 改行は \n、段落内の改行は \u000b
//   ノートは「<スライドID>:notes」というページの上にある、プレースホルダー種別が本文（1）の図形。
//   座標の単位は EMU の 1/25（スライドの横幅 365760 = 9144000 EMU）。図形の基準の大きさは 100000。
// - /present：<script> 内の `var viewerData = {… docData: [...] …}` の docData[1][i][9] に、
//   スライドごとのノートが HTML で入っている（段落内の改行は U+FFFD）。本文は入っていない。
//
// いずれも Google の内部形式なので、読めなかったときは null を返し、呼び出し側は pptx に切り替える。

globalThis.SlideReader = globalThis.SlideReader || {};

(() => {
  // 属性の並び [キー, 値, キー, 値, …] のキー 54 がプレースホルダーの種別（Slides API の PlaceholderType の順）
  const PH = { BODY: 1, CENTERED_TITLE: 4, DATE_AND_TIME: 6, SLIDE_NUMBER: 12, TITLE: 15 };
  const TOL = 45720 / 25; // 0.05 インチ

  function prop(props, key) {
    if (!Array.isArray(props)) return undefined;
    for (let i = 0; i + 1 < props.length; i += 2) if (props[i] === key) return props[i + 1];
    return undefined;
  }

  // 文字列中の JSON 配列（先頭の [ から対応する ] まで）を取り出す
  function sliceJsonArray(text, start) {
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let j = start; j < text.length; j++) {
      const c = text[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
      } else if (c === '"') {
        inStr = true;
      } else if (c === '[') {
        depth++;
      } else if (c === ']' && --depth === 0) {
        return text.slice(start, j + 1);
      }
    }
    return null;
  }

  function modelCommands(scriptTexts) {
    const cmds = [];
    for (const t of scriptTexts) {
      const start = t.indexOf('var modelChunk = ');
      if (start < 0) continue;
      const end = t.indexOf('; var modelChunkParseEnd', start);
      if (end < 0) continue;
      try {
        cmds.push(...JSON.parse(t.slice(start + 'var modelChunk = '.length, end)).chunk);
      } catch { /* 形式が変わった塊は読み飛ばす */ }
    }
    return cmds;
  }

  // 図形の文字：段落ごとに改行でつなぎ、段落内の改行（\u000b）も改行にする。表はセルを行→列の順に並べる
  function shapeText(parts) {
    const cells = [...parts.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
    return cells
      .map(([, s]) => s.replace(/\u000b/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean).join('\n'))
      .filter(Boolean)
      .join('\n');
  }

  // 編集画面のデータから [{ index, objectId, body: [図形ごとの文字], notes: [文字] }] を作る
  function deckFromModel(scriptTexts) {
    const cmds = modelCommands(scriptTexts);
    if (!cmds.length) return null;

    const slides = [];
    const shapes = new Map();
    const texts = new Map(); // 図形ID → Map(セル → 文字)
    for (const c of cmds) {
      if (c[0] === 12 && c[3] === 0) {
        slides.push({ id: c[1], order: c[2] });
      } else if (c[0] === 3) {
        shapes.set(c[1], { id: c[1], kind: c[2], transform: c[3], props: c[4], parent: c[5] });
      } else if (c[0] === 15 && typeof c[4] === 'string') {
        if (!texts.has(c[1])) texts.set(c[1], new Map());
        const cellKey = c[2] == null ? '' : JSON.stringify(c[2]);
        const cur = texts.get(c[1]).get(cellKey) ?? '';
        const at = Math.min(Math.max(0, c[3] ?? cur.length), cur.length);
        texts.get(c[1]).set(cellKey, cur.slice(0, at) + c[4] + cur.slice(at));
      }
    }
    if (!slides.length) return null;
    slides.sort((a, b) => a.order - b.order);

    // グループの中の図形は、親をたどってページを求める
    const pageOf = (shape) => {
      let p = shape.parent;
      for (let n = 0; n < 20 && shapes.has(p); n++) p = shapes.get(p).parent;
      return p;
    };
    const byPage = new Map();
    for (const shape of shapes.values()) {
      const page = pageOf(shape);
      if (!byPage.has(page)) byPage.set(page, []);
      byPage.get(page).push(shape);
    }

    const boxOf = (shape) => {
      const t = shape.transform;
      if (!Array.isArray(t) || t.length < 6) return null;
      // 画像は元の画素数、その他の図形は 100000 が基準の大きさ
      const baseW = prop(shape.props, 8) ?? 100000;
      const baseH = prop(shape.props, 9) ?? 100000;
      return { x: t[4], y: t[5], w: Math.abs(t[0] * baseW), h: Math.abs(t[3] * baseH) };
    };

    return slides.map((s, index) => {
      const items = [];
      for (const shape of byPage.get(s.id) ?? []) {
        const ph = prop(shape.props, 54);
        if (ph === PH.DATE_AND_TIME || ph === PH.SLIDE_NUMBER) continue; // 日付・スライド番号は読まない
        const text = shapeText(texts.get(shape.id) ?? new Map());
        if (!text) continue;
        const box = boxOf(shape);
        items.push({
          text,
          x: box?.x ?? null,
          y: box?.y ?? null,
          w: box?.w ?? 0,
          h: box?.h ?? 0,
          title: ph === PH.TITLE || ph === PH.CENTERED_TITLE,
        });
      }
      const body = globalThis.SlideReader.readingOrder(items, TOL).map((it) => it.text);
      const notes = (byPage.get(`${s.id}:notes`) ?? [])
        .filter((shape) => prop(shape.props, 54) === PH.BODY)
        .map((shape) => shapeText(texts.get(shape.id) ?? new Map()))
        .filter(Boolean);
      return { index, objectId: s.id, body, notes };
    });
  }

  function htmlToText(html) {
    return html
      .replace(/�/g, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|li|div|h\d)>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&(lt|gt|quot|#39|apos|nbsp|amp);/g, (_, e) => ({ lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ', amp: '&' })[e])
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .join('\n');
  }

  // /present のデータから Map(スライドID → ノートの文字) を作る
  function notesFromViewer(scriptTexts) {
    for (const t of scriptTexts) {
      if (!t.includes('var viewerData = ')) continue;
      const at = t.indexOf('docData: ');
      if (at < 0) continue;
      const json = sliceJsonArray(t, at + 'docData: '.length);
      if (!json) continue;
      try {
        const slides = JSON.parse(json)[1];
        const notes = new Map();
        for (const s of slides) {
          if (typeof s?.[0] === 'string') notes.set(s[0], typeof s[9] === 'string' ? htmlToText(s[9]) : '');
        }
        return notes.size ? notes : null;
      } catch { /* 形式が変わっていたら諦める */ }
    }
    return null;
  }

  globalThis.SlideReader.pageData = { deckFromModel, notesFromViewer };
})();
