// Chrome ウェブストア用の画像を、ヘッドレス Chrome で書き出す。
// - design/store-screenshot-1.png（1280x800）：再生中の画面
// - design/store-screenshot-2.png（1280x800）：設定・読み方の辞書・ショートカット
// - design/promo-tile-small-440x280.png / design/promo-tile-marquee-1400x560.png
// サイドパネルは本物の src/sidepanel を、撮影用の仮の chrome.*（design/store/panel-stub.js）で表示する。
//
// 使い方: npm run store-images（macOS の Google Chrome が必要）
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const STORE = `${ROOT}design/store/`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// 本物のサイドパネルの HTML から、撮影用の panel.html を作る
const panel = readFileSync(`${ROOT}src/sidepanel/sidepanel.html`, 'utf8')
  .replace('href="sidepanel.css"', 'href="../../src/sidepanel/sidepanel.css"')
  .replace('<script src="../lib/speech-text.js"></script>', '<script src="panel-stub.js"></script>\n  <script src="../../src/lib/speech-text.js"></script>')
  .replace('src="sidepanel.js"', 'src="../../src/sidepanel/sidepanel.js"');
writeFileSync(`${STORE}panel.html`, panel);

const shoot = (page, query, [w, h], out) => {
  const url = `${pathToFileURL(`${STORE}${page}`).href}?${query}`;
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
    '--force-device-scale-factor=1', `--window-size=${w},${h}`, '--virtual-time-budget=4000',
    `--screenshot=${ROOT}design/${out}`, url,
  ], { stdio: 'ignore' });
  console.log(`wrote design/${out}`);
};

shoot('screenshot.html', 'scene=reading', [1280, 800], 'store-screenshot-1.png');
shoot('screenshot.html', 'scene=settings', [1280, 800], 'store-screenshot-2.png');
shoot('banner.html', 'tile=small', [440, 280], 'promo-tile-small-440x280.png');
shoot('banner.html', 'tile=marquee', [1400, 560], 'promo-tile-marquee-1400x560.png');
