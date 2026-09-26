// ストア用画像の撮影用：chrome.* を仮の値に置き換えて、本物のサイドパネルの画面を表示する
const noop = { addListener() {} };
const params = new URLSearchParams(location.search);
const scene = params.get('scene') ?? 'reading';
const body = [
  '導入スケジュール',
  '2026年10月',
  '社内説明会と、操作マニュアルの公開',
  '2026年11月',
  '試験運用を開始し、各部署から意見を集めます。',
  '2026年12月',
  '全社での本番運用を開始',
];
const notes = ['試験運用の期間は1か月です。意見は専用のフォームで受け付けます。'];
let n = 0;
window.chrome = {
  storage: { local: { get: async () => ({ settings: { dictionaryRows: [{ from: 'PWA', to: 'ピーダブリューエー' }, { from: 'SaaS', to: 'サース' }, { from: '御社', to: 'おんしゃ' }] } }), set: async () => {} } },
  tts: {
    getVoices: async () => [{ voiceName: 'Kyoko', lang: 'ja-JP', eventTypes: ['start', 'end', 'word', 'pause'] }, { voiceName: 'Google 日本語', lang: 'ja-JP', remote: true, eventTypes: ['start', 'end'] }],
    speak(text, opts) {
      const i = n++;
      if (i < 4) { setTimeout(() => opts.onEvent({ type: 'start', charIndex: 0 }), 20 + i * 40); setTimeout(() => opts.onEvent({ type: 'end', charIndex: text.length }), 40 + i * 40); return; }
      if (i === 4) {
        setTimeout(() => opts.onEvent({ type: 'start', charIndex: 0 }), 200);
        setTimeout(() => opts.onEvent({ type: 'word', charIndex: text.indexOf('部署'), length: 2 }), 260);
      }
    },
    stop() {}, pause() {}, resume() {},
  },
  tabs: {
    query: async () => [{ id: 1, url: 'https://docs.google.com/presentation/d/x/edit' }],
    sendMessage: async () => ({ ok: true, result: { presentationId: 'x', mode: 'edit', currentSlideId: 'p4', currentSlideIndex: 3, slideCount: 12, deck: { loading: false, fetchedAt: Date.now(), slideCount: 12, source: 'page' }, source: 'page', body, notes } }),
    onActivated: noop, onUpdated: noop, create() {},
  },
  runtime: { onMessage: noop, connect: () => ({ onMessage: noop, onDisconnect: noop }) },
  windows: { getCurrent: async () => ({ id: 1 }) },
  commands: { getAll: async () => [
    { name: 'toggle-play', description: '再生／一時停止', shortcut: '⌥⇧P' },
    { name: 'next-slide', description: '次のスライドへ', shortcut: '⌥⇧→' },
    { name: 'prev-slide', description: '前のスライドへ', shortcut: '⌥⇧←' },
    { name: 'stop', description: '停止', shortcut: '⌥⇧S' },
  ] },
};
addEventListener('load', () => setTimeout(() => {
  if (scene === 'reading') {
    document.getElementById('settings').open = false;
    document.getElementById('play').click();
  } else {
    document.getElementById('settings').open = true;
    document.getElementById('dictionary-section').open = true;
    document.getElementById('shortcuts-section').open = true;
    document.getElementById('reading').style.display = 'none';
  }
}, 100));
