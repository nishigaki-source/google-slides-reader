// サイドパネル：操作画面と再生の制御。
// 再生の流れ：表示中のスライドの文章を取得 → 文ごとに chrome.tts で読む → 読み終えたら次のスライドへ送る → 繰り返す

const $ = (id) => document.getElementById(id);
const { speech } = globalThis.SlideReader;

const DEFAULTS = { target: 'both', autoAdvance: true, gapSec: 1, voiceName: null, rate: 1, highlightWord: true, dictionaryRows: [] };
let settings = { ...DEFAULTS };
let dictionary = []; // settings.dictionaryRows から作った置き換え用の辞書
const voicesByName = new Map();

let tabId = null; // 操作対象のタブ
let state = 'idle'; // idle | playing | paused
let runId = 0; // 再生のたびに増やし、古い再生の続きを打ち切る
let navigating = false; // 自分でページ送りしている間は、切り替え通知で読み直さない
let readingSlideId = null; // 表示・読み上げ中のスライド

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- タブとの通信 ---

async function send(msg) {
  if (tabId == null) throw new Error('Googleスライドのタブを開いてください');
  let res;
  try {
    res = await chrome.tabs.sendMessage(tabId, msg, { frameId: 0 });
  } catch {
    throw new Error('スライドのタブと通信できません。タブを再読み込みしてください');
  }
  if (!res?.ok) throw new Error(res?.error ?? '応答がありません');
  return res.result;
}

// --- 表示 ---

function showMessage(text, isError = false) {
  const el = $('message');
  el.textContent = text;
  el.classList.toggle('error', isError);
  el.hidden = false;
}

function hideMessage() {
  $('message').hidden = true;
}

function ago(time) {
  const min = Math.floor((Date.now() - time) / 60000);
  if (min < 1) return 'たった今';
  if (min < 60) return `${min}分前`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h}時間前` : `${Math.floor(h / 24)}日前`;
}

function renderDeck(deck) {
  const el = $('deck-state');
  el.className = 'deck-state';
  $('refresh').disabled = !deck || deck.loading;
  if (!deck) {
    el.textContent = '';
  } else if (deck.loading) {
    el.textContent = '本文とノートを取得中…（数十秒かかります）';
    el.classList.add('loading');
  } else if (deck.error) {
    el.textContent = `取得に失敗しました: ${deck.error}`;
    el.classList.add('error');
  } else if (deck.source === 'page') {
    el.textContent = `本文とノート: 読み込み済み（${deck.slideCount}枚）`;
  } else if (deck.fetchedAt) {
    el.textContent = `本文とノート: 取得済み（${deck.slideCount}枚・${ago(deck.fetchedAt)}）`;
  }
}

function renderStatus(st) {
  if (!st) {
    $('position').textContent = '-';
    renderDeck(null);
    return;
  }
  const pos = st.currentSlideIndex != null ? st.currentSlideIndex + 1 : '?';
  const count = st.slideCount ?? '?';
  $('position').textContent = `${pos} / ${count}${st.mode === 'present' ? '（スライドショー）' : ''}`;
  renderDeck(st.deck);
}

// 読む内容を組み立てて表示し、発話の一覧と対応する段落要素を返す
function renderReading(t) {
  const box = $('reading');
  box.innerHTML = '';
  const list = [];
  const els = [];
  if (!t) return { list, els };

  if (t.source === 'dom') {
    const note = document.createElement('div');
    note.className = 'source';
    note.textContent = '本文とノートの取得が終わるまで、画面に表示されている文字を読みます';
    box.append(note);
  }

  const sections = [];
  if (settings.target !== 'notes') sections.push({ title: '本文', paras: t.body });
  if (settings.target !== 'body') sections.push({ title: 'ノート', paras: t.notes });

  for (const sec of sections) {
    const h = document.createElement('h2');
    h.textContent = sec.title;
    box.append(h);
    const utterances = speech.toUtterances(sec.paras);
    if (!utterances.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = sec.title === 'ノート' && t.source === 'dom' && t.mode === 'present'
        ? '（スライドショー中は、取得が終わるまでノートを読めません）'
        : '（なし）';
      box.append(empty);
    }
    for (const u of utterances) {
      const p = document.createElement('p');
      p.textContent = u;
      box.append(p);
      list.push(u);
      els.push(p);
    }
  }
  return { list, els };
}

function highlight(els, index) {
  els.forEach((p, j) => {
    p.classList.toggle('current', j === index);
    p.classList.toggle('done', j < index);
    if (j !== index && p.querySelector('mark')) p.textContent = p.textContent; // 語の強調を外す
  });
  els[index]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// 文の中の [start, end) を、読んでいる語として強調する
function markWord(p, start, end) {
  const text = p.textContent;
  if (!(start < end) || start >= text.length) return;
  const mark = document.createElement('mark');
  mark.textContent = text.slice(start, end);
  p.replaceChildren(text.slice(0, start), mark, text.slice(end));
}

function setState(next) {
  state = next;
  updateControls();
}

function updateControls() {
  const ready = tabId != null;
  const play = $('play');
  play.textContent = state === 'playing' ? '⏸ 一時停止' : state === 'paused' ? '▶ 再開' : '▶ 再生';
  play.title = play.textContent.slice(2);
  for (const id of ['play', 'prev', 'next']) $(id).disabled = !ready;
  $('stop').disabled = !ready || state === 'idle';
}

// --- 再生 ---

// 発話を順に読み、最後まで読めたら true、途中で止められたら false で終わる
function speakAll(list, els, run) {
  return new Promise((resolve) => {
    if (!list.length) {
      resolve(true);
      return;
    }
    list.forEach((text, i) => {
      // 辞書で置き換えた文を読む。word イベントの位置は置き換え後の文のものなので、表示の位置に戻して強調する
      const { spoken, toDisplay } = speech.applyDictionaryMapped(text, dictionary);
      chrome.tts.speak(spoken, {
        voiceName: settings.voiceName || undefined,
        lang: settings.voiceName ? undefined : 'ja-JP',
        rate: settings.rate,
        enqueue: i > 0, // 先頭の発話は、前の再生の残りを打ち切る
        onEvent: (e) => {
          if (e.type === 'interrupted' || e.type === 'cancelled') return resolve(false);
          if (e.type === 'error') {
            if (run === runId) showMessage(`読み上げでエラーが起きました: ${e.errorMessage ?? ''}`, true);
            return resolve(false);
          }
          if (run !== runId) return;
          if (e.type === 'start') highlight(els, i);
          if (e.type === 'word' && settings.highlightWord && e.charIndex != null) {
            const end = speech.wordEnd(spoken, e.charIndex, e.length);
            markWord(els[i], ...toDisplay(e.charIndex, end));
          }
          if (e.type === 'end' && i === list.length - 1) {
            highlight(els, list.length);
            resolve(true);
          }
        },
      });
    });
  });
}

async function waitWhilePaused(run) {
  while (state === 'paused' && run === runId) await sleep(200);
}

async function play() {
  const run = ++runId;
  hideMessage();
  setState('playing');
  try {
    while (run === runId) {
      const t = await send({ type: 'slideText' });
      if (run !== runId) return;
      readingSlideId = t.currentSlideId;
      renderStatus(t);
      const { list, els } = renderReading(t);
      if (!(await speakAll(list, els, run)) || run !== runId) return;

      if (!settings.autoAdvance) break;
      if (t.slideCount != null && t.currentSlideIndex != null && t.currentSlideIndex >= t.slideCount - 1) {
        showMessage('最後のスライドまで読みました');
        break;
      }
      await sleep(settings.gapSec * 1000);
      await waitWhilePaused(run);
      if (run !== runId) return;

      navigating = true;
      let r;
      try {
        r = await send({ type: 'next' });
      } finally {
        navigating = false;
      }
      if (run !== runId) return;
      if (!r.moved || !r.after) {
        showMessage('最後のスライドまで読みました');
        break;
      }
      readingSlideId = r.after;
      await sleep(200); // 切り替え直後の描画を待つ
    }
  } catch (err) {
    if (run === runId) showMessage(err.message, true);
  }
  if (run === runId) setState('idle');
}

function stop() {
  runId++;
  chrome.tts.stop();
  setState('idle');
}

// 再生していないときは、表示中のスライドで読む内容を表示だけする
async function preview() {
  try {
    const t = await send({ type: 'slideText' });
    if (state !== 'idle') return;
    readingSlideId = t.currentSlideId;
    renderStatus(t);
    renderReading(t);
  } catch (err) {
    showMessage(err.message, true);
  }
}

async function go(dir) {
  const wasPlaying = state !== 'idle';
  stop();
  navigating = true;
  try {
    const r = await send({ type: dir });
    readingSlideId = r.after;
    renderStatus(r.status);
  } catch (err) {
    showMessage(err.message, true);
  } finally {
    navigating = false;
  }
  if (wasPlaying) play();
  else preview();
}

function voiceCanPause() {
  return voicesByName.get(settings.voiceName)?.eventTypes?.includes('pause') ?? false;
}

function togglePlay() {
  if (state === 'idle') {
    play();
  } else if (state === 'playing') {
    if (voiceCanPause()) {
      chrome.tts.pause();
      setState('paused');
    } else {
      stop(); // 一時停止に対応していない音声（オンラインの音声など）は停止する
      preview();
    }
  } else {
    chrome.tts.resume();
    setState('playing');
  }
}

$('play').addEventListener('click', togglePlay);
$('stop').addEventListener('click', () => {
  stop();
  preview();
});
$('prev').addEventListener('click', () => go('prev'));
$('next').addEventListener('click', () => go('next'));
$('refresh').addEventListener('click', async () => {
  try {
    renderStatus(await send({ type: 'refresh' }));
  } catch (err) {
    showMessage(err.message, true);
  }
});

// --- タブの追従 ---

async function bindActiveTab() {
  if (state !== 'idle') return; // 再生中は、再生を始めたタブのまま
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isSlides = tab?.url?.startsWith('https://docs.google.com/presentation/d/');
  tabId = isSlides ? tab.id : null;
  readingSlideId = null;
  if (!isSlides) {
    showMessage('Googleスライドのタブを開くと使えます');
    renderStatus(null);
    renderReading(null);
  } else {
    try {
      hideMessage();
      renderStatus(await send({ type: 'hello' }));
      await preview();
    } catch (err) {
      showMessage(err.message, true);
      renderStatus(null);
    }
  }
  updateControls();
}

chrome.tabs.onActivated.addListener(bindActiveTab);
chrome.tabs.onUpdated.addListener((_id, info, tab) => {
  if (tab.active && info.status === 'complete') bindActiveTab();
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (sender.tab?.id !== tabId) return;
  if (msg.type === 'deckState') {
    renderDeck(msg.deck);
    if (state === 'idle' && !msg.deck.loading) preview(); // 取得が終わったら表示を取得結果に切り替える
  } else if (msg.type === 'slideChanged') {
    renderStatus(msg.status);
    if (navigating || msg.status.currentSlideId === readingSlideId) return;
    // 手動でスライドを切り替えたら、そのスライドから読み直す
    if (state === 'playing') play();
    else {
      if (state === 'paused') stop();
      preview();
    }
  }
});

addEventListener('pagehide', () => chrome.tts.stop());

// --- 設定 ---

const saveSettings = () => chrome.storage.local.set({ settings });

async function loadSettings() {
  const saved = (await chrome.storage.local.get('settings')).settings ?? {};
  // 旧形式（「表記=読み」の文字列）で保存されていたら表形式に移す
  if (typeof saved.dictionary === 'string' && !saved.dictionaryRows) saved.dictionaryRows = speech.parseDictionaryText(saved.dictionary);
  delete saved.dictionary;
  settings = { ...DEFAULTS, ...saved };

  const voices = await chrome.tts.getVoices();
  const ja = voices.filter((v) => v.lang?.toLowerCase().startsWith('ja'));
  const list = ja.length ? ja : voices;
  for (const v of list) {
    voicesByName.set(v.voiceName, v);
    $('voice').add(new Option(`${v.voiceName}${v.remote ? '（オンライン）' : ''}`, v.voiceName));
  }
  if (!voicesByName.has(settings.voiceName)) {
    // 既定は端末内の音声（一時停止ができ、オフラインでも動く）。Kyoko があれば優先する
    settings.voiceName = (list.find((v) => v.voiceName === 'Kyoko') ?? list.find((v) => !v.remote) ?? list[0])?.voiceName ?? null;
  }

  $('target').value = settings.target;
  $('auto-advance').checked = settings.autoAdvance;
  $('gap').value = settings.gapSec;
  $('voice').value = settings.voiceName ?? '';
  $('rate').value = settings.rate;
  $('rate-value').textContent = Number(settings.rate).toFixed(1);
  $('highlight-word').checked = settings.highlightWord;
  renderDictionary();
}

$('target').addEventListener('change', () => {
  settings.target = $('target').value;
  saveSettings();
  if (state === 'idle') preview();
});
$('auto-advance').addEventListener('change', () => {
  settings.autoAdvance = $('auto-advance').checked;
  saveSettings();
});
$('gap').addEventListener('change', () => {
  settings.gapSec = Math.min(10, Math.max(0, Number($('gap').value) || 0));
  saveSettings();
});
$('voice').addEventListener('change', () => {
  settings.voiceName = $('voice').value;
  saveSettings();
});
$('highlight-word').addEventListener('change', () => {
  settings.highlightWord = $('highlight-word').checked;
  saveSettings();
});
$('rate').addEventListener('input', () => {
  settings.rate = Number($('rate').value);
  $('rate-value').textContent = settings.rate.toFixed(1);
  saveSettings();
});

// --- 読み方の辞書（1 行＝スライドの文字と読み方の組） ---

let dictionaryTimer = null;

function updateDictionary({ save = true } = {}) {
  dictionary = speech.buildDictionary(settings.dictionaryRows);
  $('dictionary-count').textContent = dictionary.length ? `（${dictionary.length}件）` : '';
  // 同じ文字が 2 回登録されていたら、後の行に印を付ける（先の行が使われる）
  const seen = new Set();
  for (const row of $('dictionary-rows').children) {
    const from = row.querySelector('.from')?.value.trim();
    row.classList.toggle('dup', Boolean(from) && seen.has(from));
    row.title = row.classList.contains('dup') ? '同じ文字が上の行にも登録されています（上の行が使われます）' : '';
    if (from) seen.add(from);
    const test = row.querySelector('.test');
    if (test) test.disabled = !row.querySelector('.to').value.trim();
  }
  $('dictionary-dup').hidden = !$('dictionary-rows').querySelector('.dup');
  if (!save) return;
  clearTimeout(dictionaryTimer);
  dictionaryTimer = setTimeout(saveSettings, 300);
}

function renderDictionary(focusIndex = null) {
  const box = $('dictionary-rows');
  box.innerHTML = '';
  settings.dictionaryRows.forEach((entry, i) => {
    const row = document.createElement('div');
    row.className = 'dict-row';
    row.innerHTML = `
      <input class="from" placeholder="例：PWA" aria-label="スライドの文字">
      <input class="to" placeholder="例：ピーダブリューエー" aria-label="読み方">
      <button class="test" title="読み方を試し聞き" aria-label="試し聞き">▶</button>
      <button class="remove" title="この行を削除" aria-label="削除">✕</button>`;
    const from = row.querySelector('.from');
    const to = row.querySelector('.to');
    from.value = entry.from;
    to.value = entry.to;
    from.addEventListener('input', () => { entry.from = from.value; updateDictionary(); });
    to.addEventListener('input', () => { entry.to = to.value; updateDictionary(); });
    to.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addDictionaryRow(); // 読み方で Enter を押したら次の行へ
    });
    row.querySelector('.test').addEventListener('click', () => {
      if (state !== 'idle') return; // 再生中は試し聞きしない
      chrome.tts.speak(to.value.trim(), {
        voiceName: settings.voiceName || undefined,
        lang: settings.voiceName ? undefined : 'ja-JP',
        rate: settings.rate,
      });
    });
    row.querySelector('.remove').addEventListener('click', () => {
      settings.dictionaryRows.splice(i, 1);
      renderDictionary();
      updateDictionary();
    });
    box.append(row);
  });
  if (!settings.dictionaryRows.length) {
    box.innerHTML = '<div class="dict-empty">まだ登録がありません</div>';
  }
  updateDictionary({ save: false });
  if (focusIndex != null) box.children[focusIndex]?.querySelector('.from')?.focus();
}

function addDictionaryRow() {
  // 最後の行が空なら、新しい行を増やさずにそこへ移る
  const last = settings.dictionaryRows[settings.dictionaryRows.length - 1];
  if (!last || last.from.trim() || last.to.trim()) settings.dictionaryRows.push({ from: '', to: '' });
  renderDictionary(settings.dictionaryRows.length - 1);
}

$('dictionary-add').addEventListener('click', addDictionaryRow);

// --- キーボードショートカット ---
// ショートカットはバックグラウンドが受け取り、このパネルへ送ってくる

const COMMANDS = {
  'toggle-play': togglePlay,
  'next-slide': () => go('next'),
  'prev-slide': () => go('prev'),
  stop: () => {
    stop();
    preview();
  },
};

async function showShortcuts() {
  const dl = $('shortcuts');
  dl.innerHTML = '';
  for (const c of await chrome.commands.getAll()) {
    if (!COMMANDS[c.name]) continue;
    dl.insertAdjacentHTML('beforeend', '<dt></dt><dd></dd>');
    dl.lastElementChild.previousElementSibling.textContent = c.description;
    dl.lastElementChild.textContent = c.shortcut || '（未設定）';
  }
}

$('edit-shortcuts').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));

const initialized = loadSettings().then(bindActiveTab);

// バックグラウンドとつなぐ。バックグラウンドが休止して切れたら、つなぎ直す
async function connectBackground() {
  const { id: windowId } = await chrome.windows.getCurrent();
  const port = chrome.runtime.connect({ name: `sidepanel:${windowId}` });
  port.onMessage.addListener(async (msg) => {
    if (msg.type !== 'command') return;
    await initialized;
    if (tabId == null) await bindActiveTab();
    COMMANDS[msg.command]?.();
  });
  port.onDisconnect.addListener(() => setTimeout(connectBackground, 500));
}

connectBackground();
showShortcuts();
addEventListener('focus', showShortcuts); // ショートカットを変更して戻ってきたときに表示を更新
