// 拡張のスクリプト（ブラウザ用の素の JS）を Node のグローバルに読み込む
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const loaded = new Set();

module.exports = function load(...files) {
  for (const f of files) {
    if (loaded.has(f)) continue;
    loaded.add(f);
    vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
  }
  return globalThis.SlideReader;
};

module.exports.fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));
