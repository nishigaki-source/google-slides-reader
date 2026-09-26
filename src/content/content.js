// スライドのタブで動き、サイドパネルの要求に応える。
// - 本文とノートの用意。優先順：ページに埋め込まれたデータ（すぐ読める）→ 保存結果 → pptx の書き出し（数十秒）
// - 表示中のスライドの判別と、スライド切り替えの通知
// - ページ送り

(() => {
  const { page, fetchPresentation, pageData } = globalThis.SlideReader;
  const presentationId = page.presentationId();
  if (!presentationId) return;

  // 取り出し方（読み上げ順など）を変えたら版を上げる。古い版の保存結果は使わずに取り直す
  const DECK_FORMAT = 2;
  const storageKey = `deck:v${DECK_FORMAT}:${presentationId}`;
  const STALE_MS = 30 * 60 * 1000; // これより古い保存結果は、サイドパネルを開いたときに裏で取り直す

  let deck = null; // { slides, fetchedAt, elapsedMs, source: 'page' | 'pptx' }
  let deckIsCurrent = false; // このページを開いた時点のデータなら true（古くなったか確かめなくてよい）
  let loading = null; // 取得中の Promise
  let lastError = null;
  let autoRefreshed = false; // 自動の取り直しはページを開いている間に 1 回だけ（ID が合わない資料で繰り返さないため）

  // サイドパネルが閉じているときは受け手がいないので、失敗は無視する
  const notify = (msg) => chrome.runtime.sendMessage({ presentationId, ...msg }).catch(() => {});

  function deckState() {
    return {
      loading: Boolean(loading),
      fetchedAt: deck?.fetchedAt ?? null,
      slideCount: deck?.slides.length ?? null,
      source: deck?.source ?? null,
      error: lastError,
    };
  }

  const scriptTexts = () => [...document.scripts].map((el) => el.textContent);

  // 編集画面に埋め込まれたデータから読む。スライドが一部しか入っていなければ使わない
  function deckFromPage() {
    try {
      const slides = pageData.deckFromModel(scriptTexts());
      if (!slides?.length) return null;
      const expected = page.slideCount();
      if (expected && slides.length < expected) return null;
      return slides;
    } catch {
      return null;
    }
  }

  // /present に埋め込まれたノート（本文は入っていない）。保存結果が無いあいだ、画面の本文と組み合わせて使う
  let viewerNotes = null;
  try {
    viewerNotes = pageData.notesFromViewer(scriptTexts());
  } catch { /* 読めなければ使わない */ }

  function loadDeck() {
    if (loading) return loading;
    lastError = null;
    const startedAt = Date.now();
    loading = fetchPresentation(presentationId)
      .then(async (slides) => {
        deck = { slides, fetchedAt: Date.now(), elapsedMs: Date.now() - startedAt, source: 'pptx' };
        deckIsCurrent = true;
        await chrome.storage.local.set({ [storageKey]: deck });
      })
      .catch((err) => { lastError = String(err?.message ?? err); })
      .finally(() => {
        loading = null;
        notify({ type: 'deckState', deck: deckState() });
      });
    notify({ type: 'deckState', deck: deckState() });
    return loading;
  }

  // ID で探す。ID が分からないときだけ何枚目かで探す（保存結果が古いと別のスライドを指すため）
  function findSlide(id, index) {
    if (!deck) return null;
    if (id) return deck.slides.find((s) => s.objectId === id) ?? null;
    return index != null ? deck.slides[index] ?? null : null;
  }

  function status() {
    const currentSlideId = page.currentSlideId();
    const currentSlideIndex = findSlide(currentSlideId, null)?.index ?? page.currentSlideIndex();
    return {
      presentationId,
      mode: page.mode(),
      currentSlideId,
      currentSlideIndex,
      slideCount: deck?.slides.length ?? page.slideCount(),
      deck: deckState(),
    };
  }

  async function waitForSlideChange(before, timeoutMs = 2000) {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      await new Promise((r) => setTimeout(r, 100));
      if (page.currentSlideId() !== before) return;
    }
  }

  async function handle(msg) {
    switch (msg.type) {
      case 'hello':
        if (deck && !deckIsCurrent && !loading && Date.now() - deck.fetchedAt > STALE_MS) loadDeck();
        return status();

      case 'status':
        return status();

      case 'refresh':
        loadDeck();
        return status();

      case 'slideText': {
        const st = status();
        const slide = findSlide(st.currentSlideId, st.currentSlideIndex);
        if (slide) return { ...st, source: 'pptx', body: slide.body, notes: slide.notes };
        // 保存結果に無いスライド（取得後に追加された）なら、保存結果が古いので取り直す
        if (deck && st.currentSlideId && !loading && !autoRefreshed) {
          autoRefreshed = true;
          loadDeck();
        }
        const dom = page.domSlideText();
        const notes = viewerNotes?.get(st.currentSlideId);
        return { ...st, source: 'dom', body: dom.body, notes: notes ? [notes] : dom.notes, deck: deckState() };
      }

      case 'next':
      case 'prev': {
        const before = page.currentSlideId();
        page[msg.type]();
        await waitForSlideChange(before);
        const after = status();
        return { before, after: after.currentSlideId, moved: after.currentSlideId !== before, status: after };
      }

      default:
        throw new Error(`不明な要求: ${msg.type}`);
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    handle(msg).then(
      (result) => sendResponse({ ok: true, result }),
      (err) => sendResponse({ ok: false, error: String(err?.message ?? err) }),
    );
    return true; // 非同期で応答する
  });

  // スライドの切り替えを監視して知らせる（編集画面・スライドショーの iframe どちらにも効くようポーリング）
  let lastSlideId = page.currentSlideId();
  setInterval(() => {
    const id = page.currentSlideId();
    if (id !== lastSlideId) {
      lastSlideId = id;
      notify({ type: 'slideChanged', status: status() });
    }
  }, 400);

  // ページに埋め込まれたデータがあればそれを使う（保存もしておき、/present を開いたときに使う）。
  // 無ければ保存結果を使い、それも無ければ開いた時点で裏で pptx の取得を始める
  const fromPage = deckFromPage();
  if (fromPage) {
    deck = { slides: fromPage, fetchedAt: Date.now(), elapsedMs: 0, source: 'page' };
    deckIsCurrent = true;
    chrome.storage.local.set({ [storageKey]: deck });
    notify({ type: 'deckState', deck: deckState() });
  } else {
    chrome.storage.local.get(storageKey).then((stored) => {
      if (stored[storageKey]) {
        deck = stored[storageKey];
        notify({ type: 'deckState', deck: deckState() });
      } else {
        loadDeck();
      }
    });
  }
  // 古い版の保存結果を片付ける
  chrome.storage.local.remove([`deck:${presentationId}`, ...Array.from({ length: DECK_FORMAT - 1 }, (_, i) => `deck:v${i + 1}:${presentationId}`)]);
})();
