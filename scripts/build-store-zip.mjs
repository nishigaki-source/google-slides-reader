// Chrome ウェブストア提出用の zip を作る。
//
// この拡張はビルド不要（素の JavaScript）なので、拡張の動作に必要なファイルだけを
// dist-store/ にコピーして zip 化する。tests/ や notes/、docs/（プライバシーポリシーのページ）は含めない。
//
// 注意（ルビふり for Googleスライドの提出時に分かったこと）：manifest.json に "key" があると、
// ストアへのアップロードは「マニフェストでは key フィールドを使用できません」で拒否される。
//
// 使い方: npm run build:store-zip
import { execSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url)); // フォルダ名が日本語なので pathname ではなくデコードした値を使う
const OUT = `${ROOT}dist-store`;
const ZIP_PATH = `${ROOT}google-slides-reader.zip`;
const INCLUDE = ['manifest.json', '_locales', 'icons', 'src'];

const manifest = JSON.parse(readFileSync(`${ROOT}manifest.json`, 'utf8'));
if ('key' in manifest) {
  console.error('manifest.json に key があります。ストアは受け付けないので外してください。');
  process.exit(1);
}

// manifest が参照するファイルがすべてあるか確かめる
const referenced = [
  ...Object.values(manifest.icons ?? {}),
  ...Object.values(manifest.action?.default_icon ?? {}),
  manifest.side_panel?.default_path,
  manifest.background?.service_worker,
  ...(manifest.content_scripts ?? []).flatMap((c) => c.js ?? []),
  `_locales/${manifest.default_locale}/messages.json`,
].filter(Boolean);
const missing = referenced.filter((f) => !existsSync(`${ROOT}${f}`));
if (missing.length) {
  console.error(`manifest が参照するファイルがありません: ${missing.join(', ')}`);
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
for (const f of INCLUDE) cpSync(`${ROOT}${f}`, `${OUT}/${f}`, { recursive: true });

rmSync(ZIP_PATH, { force: true });
execSync(`zip -r -q "${ZIP_PATH}" . -x ".*" -x "*/.*"`, { cwd: OUT, stdio: 'inherit' });

console.log(`✓ ${ZIP_PATH} を作成しました（v${manifest.version}）。`);
console.log(execSync(`unzip -l "${ZIP_PATH}"`, { encoding: 'utf8' }));
