// Googleスライドを pptx でエクスポートし、スライドごとの本文とスピーカーノートを取り出す。
// content script から読み込む前提（fetch は docs.google.com 同一オリジンとして Cookie 付きで送られる）。

// --- 最小限の ZIP リーダー（stored / deflate のみ対応） ---

async function readZip(buffer) {
  const view = new DataView(buffer);
  let eocd = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIPの終端レコードが見つかりません（pptxではない応答の可能性）');

  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const entries = new Map();
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('ZIPの中央ディレクトリが壊れています');
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = decoder.decode(new Uint8Array(buffer, p + 46, nameLen));
    entries.set(name, { method, compSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }

  return {
    names: () => [...entries.keys()],
    async text(name) {
      const e = entries.get(name);
      if (!e) return null;
      const lNameLen = view.getUint16(e.localOffset + 26, true);
      const lExtraLen = view.getUint16(e.localOffset + 28, true);
      const data = new Uint8Array(buffer, e.localOffset + 30 + lNameLen + lExtraLen, e.compSize);
      if (e.method === 0) return decoder.decode(data);
      if (e.method !== 8) throw new Error(`未対応の圧縮方式: ${e.method}`);
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return await new Response(stream).text();
    },
  };
}

// --- XML ヘルパー ---
// Googleスライドのページは Trusted Types が有効で DOMParser が使えないため、
// エクスポートされる pptx の固定的な構造を前提に、正規表現で必要な要素だけを拾う。

const decodeXml = (s) => s.replace(/&(lt|gt|quot|apos|amp|#x[0-9a-f]+|#\d+);/gi, (_, e) => {
  switch (e.toLowerCase()) {
    case 'lt': return '<';
    case 'gt': return '>';
    case 'quot': return '"';
    case 'apos': return "'";
    case 'amp': return '&';
    default: return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  }
});

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? decodeXml(m[1]) : null;
};

// <tag ...>...</tag> または <tag .../> を列挙する（同名タグが入れ子にならない要素専用）
function* elements(xml, tag) {
  const re = new RegExp(`<${tag}(?=[\\s>/])[^>]*?(?:/>|>([\\s\\S]*?)</${tag}>)`, 'g');
  for (const m of xml.matchAll(re)) yield { open: m[0].slice(0, m[0].indexOf('>') + 1), inner: m[1] ?? '', pos: m.index };
}

function resolvePath(baseFile, target) {
  if (target.startsWith('/')) return target.slice(1);
  const parts = baseFile.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

async function readRels(zip, file) {
  const xml = await zip.text(file.replace(/([^/]+)$/, '_rels/$1.rels'));
  const rels = new Map();
  if (!xml) return rels;
  for (const r of elements(xml, 'Relationship')) {
    rels.set(attr(r.open, 'Id'), {
      type: attr(r.open, 'Type').split('/').pop(),
      path: resolvePath(file, attr(r.open, 'Target')),
    });
  }
  return rels;
}

// 段落（a:p）単位でテキストを取り出す。a:br は改行、a:tab は空白として扱う。
function paragraphsOf(xml) {
  const out = [];
  for (const p of elements(xml, 'a:p')) {
    let s = '';
    for (const m of p.inner.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>|<a:t\s*\/>|<a:(br|tab)(?=[\s>/])/g)) {
      if (m[2] === 'br') s += '\n';
      else if (m[2] === 'tab') s += ' ';
      else if (m[1]) s += decodeXml(m[1]);
    }
    s = s.replace(/\u000b/g, '\n').trim();
    if (s) out.push(s);
  }
  return out;
}

// --- 読み上げ順 ---
// pptx 内の図形は重ね順（作成・前面移動の順）に並んでおり、見出しが最後に来ることがある。
// タイトルのプレースホルダーを先頭に、残りは位置と大きさから reading-order.js で並べ替える。

const TOL_EMU = 45720; // 0.05 インチ。これ以下の重なりは重なっていないとみなす

function placeholderOf(inner) {
  const ph = inner.match(/<p:ph(?=[\s>/])[^>]*>/)?.[0];
  return ph ? { type: attr(ph, 'type') ?? 'body', idx: attr(ph, 'idx') } : null;
}

// 位置（a:off）と大きさ（a:ext）。extLst の <a:ext uri=…> と取り違えないよう cx を持つものだけ拾う
function boxOf(inner) {
  const off = inner.match(/<a:off\s[^>]*>/)?.[0];
  if (!off) return null;
  const ext = inner.match(/<a:ext\s[^>]*\bcx="[^>]*>/)?.[0];
  return {
    x: Number(attr(off, 'x')),
    y: Number(attr(off, 'y')),
    w: ext ? Number(attr(ext, 'cx')) : 0,
    h: ext ? Number(attr(ext, 'cy')) : 0,
  };
}

// レイアウトやマスターにあるプレースホルダーの位置一覧
function placeholderPositions(xml) {
  const list = [];
  for (const sp of elements(xml ?? '', 'p:sp')) {
    const ph = placeholderOf(sp.inner);
    const box = boxOf(sp.inner);
    if (ph && box) list.push({ ...ph, box });
  }
  return list;
}

// スライド上で位置が省略されたプレースホルダーは、レイアウト→マスターの順に位置を探す
function inheritedBox(ph, inheritedLists) {
  for (const list of inheritedLists) {
    const hit = (ph.idx != null && list.find((p) => p.idx === ph.idx)) || list.find((p) => p.type === ph.type);
    if (hit) return hit.box;
  }
  return null;
}

function slideParagraphsInReadingOrder(slideXml, inheritedLists) {
  const items = [];
  for (const tag of ['p:sp', 'p:graphicFrame']) {
    for (const el of elements(slideXml, tag)) {
      const paras = paragraphsOf(el.inner);
      if (!paras.length) continue;
      const ph = placeholderOf(el.inner);
      if (ph && (ph.type === 'sldNum' || ph.type === 'dt')) continue; // スライド番号・日付は読まない
      const box = boxOf(el.inner) ?? (ph && inheritedBox(ph, inheritedLists));
      items.push({
        paras,
        pos: el.pos,
        x: box?.x ?? null,
        y: box?.y ?? null,
        w: box?.w ?? 0,
        h: box?.h ?? 0,
        title: /^(ctrTitle|title)$/.test(ph?.type ?? ''),
      });
    }
  }
  // 図形ごとに段落を改行でつないだ 1 つの文字列にする（読み上げ時に図形の中だけで文をつなぐため）
  return globalThis.SlideReader.readingOrder(items, TOL_EMU).map((it) => it.paras.join('\n'));
}

// --- 公開関数 ---

// content script はモジュールとして読み込めないため、グローバルに公開する
globalThis.SlideReader = globalThis.SlideReader || {};

globalThis.SlideReader.fetchPresentation = async function fetchPresentation(presentationId) {
  const res = await fetch(`/presentation/d/${presentationId}/export/pptx`);
  if (!res.ok) throw new Error(`エクスポートに失敗しました: HTTP ${res.status}`);
  const zip = await readZip(await res.arrayBuffer());

  const presFile = 'ppt/presentation.xml';
  const presRels = await readRels(zip, presFile);
  const presXml = await zip.text(presFile);

  // レイアウト・マスターのプレースホルダー位置は複数スライドで共有されるのでキャッシュする
  const inheritedCache = new Map();
  async function inheritedFor(file) {
    if (!inheritedCache.has(file)) {
      const list = placeholderPositions(await zip.text(file));
      const parent = [...(await readRels(zip, file)).values()].find((r) => r.type === 'slideMaster');
      inheritedCache.set(file, parent ? [list, ...(await inheritedFor(parent.path))] : [list]);
    }
    return inheritedCache.get(file);
  }

  const slides = [];
  for (const [index, sldId] of [...elements(presXml, 'p:sldId')].entries()) {
    const slideFile = presRels.get(attr(sldId.open, 'r:id'))?.path;
    if (!slideFile) continue;
    const slideRels = [...(await readRels(zip, slideFile)).values()];
    const layoutRel = slideRels.find((r) => r.type === 'slideLayout');
    const inherited = layoutRel ? await inheritedFor(layoutRel.path) : [];
    const body = slideParagraphsInReadingOrder(await zip.text(slideFile), inherited);

    let notes = [];
    let objectId = null;
    const notesRel = slideRels.find((r) => r.type === 'notesSlide');
    if (notesRel) {
      for (const sp of elements(await zip.text(notesRel.path), 'p:sp')) {
        const cNvPr = sp.inner.match(/<p:cNvPr(?=[\s>/])[^>]*>/)?.[0] ?? '';
        // Google のエクスポートでは "Google Shape;33;<スライドのオブジェクトID>:notes" という名前が付く
        const m = (attr(cNvPr, 'name') ?? '').match(/;([^;]+):notes$/);
        if (m) objectId ??= m[1];
        const ph = sp.inner.match(/<p:ph(?=[\s>/])[^>]*>/)?.[0];
        if (ph && attr(ph, 'type') === 'body') notes.push(paragraphsOf(sp.inner).join('\n'));
      }
    }
    slides.push({ index, objectId, body, notes: notes.filter(Boolean) });
  }
  return slides;
};
