// ツールバーのアイコンを押したらサイドパネルを開く（スライドに重ならないようにポップアップは使わない）
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

// 開いているサイドパネル（ウィンドウごと）。パネル側から接続してくる
const panels = new Map(); // windowId → port
let pending = null; // パネルが閉じていたときのショートカット { windowId, command, at }

chrome.runtime.onConnect.addListener((port) => {
  const m = port.name.match(/^sidepanel:(\d+)$/);
  if (!m) return;
  const windowId = Number(m[1]);
  panels.set(windowId, port);
  port.onDisconnect.addListener(() => {
    if (panels.get(windowId) === port) panels.delete(windowId);
  });
  // ショートカットでパネルを開いた直後なら、そのショートカットを実行させる
  if (pending?.windowId === windowId && Date.now() - pending.at < 10000) {
    port.postMessage({ type: 'command', command: pending.command });
  }
  pending = null;
});

// 再生の制御はサイドパネルが持っているので、ショートカットはパネルへ渡す。
// パネルが閉じていれば開く（sidePanel.open はショートカット操作の中で同期的に呼ぶ必要がある）
chrome.commands.onCommand.addListener((command, tab) => {
  const windowId = tab?.windowId;
  if (windowId == null) return;
  const port = panels.get(windowId);
  if (port) {
    port.postMessage({ type: 'command', command });
    return;
  }
  pending = { windowId, command, at: Date.now() };
  chrome.sidePanel.open({ windowId }).catch(console.error);
});
