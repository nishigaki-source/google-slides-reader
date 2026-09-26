// 読み上げ用に文章を整え、発話の単位（文）に分ける。

globalThis.SlideReader = globalThis.SlideReader || {};

const BULLET = /^[\s]*[•●○◦■□◆◇▪▫▶►▸‣・\-–—*＊✓✔☐☑→⇒]+\s*/;
// 行頭がこれなら、改行を項目の区切りとして残す（箇条書き・番号付き）
const LIST_ITEM = /^\s*(?:[•●○◦■□◆◇▪▫▶►▸‣・\-–—*＊✓✔☐☑→⇒]|\d+[.)．、]|[①-⑳]|[（(]\d+[)）])/;

// 図形の中の改行（段落の区切りも含む）の前後が 1 つの文の途中なら、区切らずにつなぐ。
// 例：「新システム」＋「による運用のみ」→ 1 文。「操作マニュアルの公開」＋「試験運用の開始」→ 別々
// 改行が Enter（段落）か Shift+Enter（段落内の改行）かでは判断できないため、文の形で判断する。
function continues(prev, next) {
  if (LIST_ITEM.test(next)) return false;
  if (/[。．！？!?：:」』）)]$/.test(prev)) return false;
  return /[、，,]$/.test(prev) // 読点で終わっている
    || /^[\u3041-\u309F]/.test(next) // ひらがなで始まる（助詞などの続き）
    || /^[a-z]/.test(next); // 英語の小文字で始まる
}

// block は 1 つの図形（テキストボックス）の文字。図形をまたいではつながない
function joinContinuations(block) {
  const lines = [];
  for (const line of block.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const prev = lines[lines.length - 1];
    if (prev !== undefined && continues(prev, t)) {
      lines[lines.length - 1] = prev + (/[A-Za-z0-9.,;)]$/.test(prev) && /^[A-Za-z0-9(]/.test(t) ? ' ' : '') + t;
    } else {
      lines.push(t);
    }
  }
  return lines;
}

const MAX_UTTERANCE = 200; // 長すぎる発話は途中で止まることがあるため、読点などで分ける

function normalizeLine(line) {
  return line
    .replace(BULLET, '')
    .replace(/https?:\/\/\S+/g, 'URL')
    .replace(/URL(?:\s*URL)+/g, 'URL') // URL が続く場合は 1 回だけ読む
    .replace(/\p{Extended_Pictographic}️?/gu, '')
    .replace(/[\s　]+/g, ' ')
    .trim();
}

function splitLong(sentence) {
  if (sentence.length <= MAX_UTTERANCE) return [sentence];
  const out = [];
  let rest = sentence;
  while (rest.length > MAX_UTTERANCE) {
    const head = rest.slice(0, MAX_UTTERANCE);
    const cut = Math.max(head.lastIndexOf('、'), head.lastIndexOf('，'), head.lastIndexOf(','), head.lastIndexOf(' '));
    const at = cut > MAX_UTTERANCE / 2 ? cut + 1 : MAX_UTTERANCE;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}

globalThis.SlideReader.speech = {
  // 図形ごとの文字の配列 → 発話の配列。文末・行の区切り（文の途中の改行はつなぐ）・箇条書きの項目で分ける
  toUtterances(paragraphs) {
    const out = [];
    for (const line of paragraphs.flatMap(joinContinuations)) {
      const text = normalizeLine(line);
      if (!text) continue;
      for (const sentence of text.split(/(?<=[。．！？!?])\s*|(?<=\.)\s+/)) {
        const s = sentence.trim();
        if (s && /[\p{L}\p{N}]/u.test(s)) out.push(...splitLong(s));
      }
    }
    return out;
  },

  // [{ from, to }] の一覧から置き換え用の辞書を作る。空の行は除き、長い表記を先に置き換える
  buildDictionary(rows) {
    return (rows ?? [])
      .map(({ from, to }) => [(from ?? '').trim(), (to ?? '').trim()])
      .filter(([from], i, all) => from && all.findIndex(([f]) => f === from) === i) // 同じ文字は上の行を使う
      .sort((a, b) => b[0].length - a[0].length);
  },

  // 旧形式（「表記=読み」を 1 行ずつ書いた文字列）を [{ from, to }] に変換する。区切りは = ＝ タブ
  parseDictionaryText(text) {
    const rows = [];
    for (const line of (text ?? '').split('\n')) {
      const m = line.match(/^\s*(.+?)\s*[=＝\t]\s*(.*?)\s*$/);
      if (m && m[1]) rows.push({ from: m[1], to: m[2] });
    }
    return rows;
  },

  // 1 回の走査で置き換え、置き換え後の読みが別の表記に当たっても二重に置き換えない
  applyDictionary(text, entries) {
    return this.applyDictionaryMapped(text, entries).spoken;
  },

  // 辞書で置き換えた文（spoken）と、spoken の範囲を元の文（画面の表示）の範囲に戻す関数 toDisplay を返す。
  // 読み上げの word イベントは spoken の位置で届くので、強調表示のために元の文の位置へ戻す。
  // 置き換えた語の途中を指す範囲は、置き換え前の語全体に広げる。
  applyDictionaryMapped(text, entries) {
    const segs = []; // [spoken の開始, 終了, 元の文の開始, 終了, 置き換えたか]
    let spoken = '';
    let last = 0;
    const keep = (end) => {
      if (end > last) segs.push([spoken.length, spoken.length + (end - last), last, end, false]);
      spoken += text.slice(last, end);
    };
    if (entries.length) {
      const map = new Map(entries);
      const re = new RegExp(entries.map(([from]) => from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
      for (const m of text.matchAll(re)) {
        keep(m.index);
        const to = map.get(m[0]);
        segs.push([spoken.length, spoken.length + to.length, m.index, m.index + m[0].length, true]);
        spoken += to;
        last = m.index + m[0].length;
      }
    }
    keep(text.length);

    const startOf = (pos) => {
      for (const [ss, se, ds, , replaced] of segs) if (pos >= ss && pos < se) return replaced ? ds : ds + (pos - ss);
      return text.length;
    };
    const endOf = (pos) => {
      for (const [ss, se, ds, de, replaced] of segs) if (pos > ss && pos <= se) return replaced ? de : ds + (pos - ss);
      return text.length;
    };
    return { spoken, toDisplay: (start, end) => [startOf(start), endOf(end)] };
  },

  // 読み上げ中の語の終わり。長さが届けばそれを使い、届かなければ単語の区切りから求める
  wordEnd(text, start, length) {
    if (length > 0) return Math.min(text.length, start + length);
    for (const s of new Intl.Segmenter('ja', { granularity: 'word' }).segment(text)) {
      if (start >= s.index && start < s.index + s.segment.length) return s.index + s.segment.length;
    }
    return text.length;
  },
};
