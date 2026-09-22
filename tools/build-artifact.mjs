/**
 * index.html + assets/styles.css + src/*.js を 1 枚の HTML にまとめる。
 *
 * 用途は 2 つ:
 *  - Claude の Artifact として公開する（ページ本体のみを渡す形式が必要）
 *  - file:// で直接開けるビルド（ES モジュールは file:// で読めないため）
 *
 * モジュールの連結は「各ファイルの import 文を落とし、export を外して
 * 依存順につなぐ」という単純な方式です。そのため src/*.js では
 *  - import は必ずファイル先頭にまとめる
 *  - 同名のトップレベル宣言を別ファイルに作らない
 * という 2 点を守ってください（違反すると下のチェックで落ちます）。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** 依存順。後ろのファイルが前のファイルの宣言を使えます。 */
const MODULES = ['src/criteria.js', 'src/scoring.js', 'src/history.js', 'src/app.js'];

/** import 文を丸ごと落とし、export キーワードだけ外す。 */
function stripModuleSyntax(source, file) {
  const lines = source.split('\n');
  const out = [];
  let skipping = false;

  for (const line of lines) {
    if (skipping) {
      if (/;\s*$/.test(line)) skipping = false;
      continue;
    }
    if (/^import\s/.test(line)) {
      if (!/;\s*$/.test(line)) skipping = true;
      continue;
    }
    out.push(line.replace(/^export\s+(?=(const|let|var|function|class|async)\b)/, ''));
  }

  const code = out.join('\n');
  const leftover = code.match(/^\s*(import|export)\b.*/m);
  if (leftover) {
    throw new Error(`${file}: 連結できない構文が残っています -> ${leftover[0].trim()}`);
  }
  return code;
}

function extractBody(html) {
  const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!match) throw new Error('index.html に <body> が見つかりません');
  return match[1].replace(/\n?\s*<script[^>]*type="module"[^>]*><\/script>\s*/i, '\n');
}

function extractHeadTag(html, tagPattern) {
  const match = html.match(tagPattern);
  return match ? match[0] : '';
}

const html = await readFile(join(root, 'index.html'), 'utf8');
const css = await readFile(join(root, 'assets/styles.css'), 'utf8');

const bundle = (
  await Promise.all(
    MODULES.map(async (file) => {
      const source = await readFile(join(root, file), 'utf8');
      return `/* ---- ${file} ---- */\n${stripModuleSyntax(source, file)}`;
    }),
  )
).join('\n\n');

const page = [
  extractHeadTag(html, /<title>[\s\S]*?<\/title>/i),
  extractHeadTag(html, /<link rel="preconnect"[^>]*fonts\.googleapis[^>]*>/i),
  extractHeadTag(html, /<link rel="preconnect"[^>]*fonts\.gstatic[^>]*>/i),
  extractHeadTag(html, /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/i),
  `<style>\n${css}\n</style>`,
  extractBody(html).trim(),
  `<script>\n(() => {\n${bundle}\n})();\n</script>`,
]
  .filter(Boolean)
  .join('\n');

await mkdir(join(root, 'dist'), { recursive: true });
await writeFile(join(root, 'dist/artifact.html'), `${page}\n`, 'utf8');

console.log(`dist/artifact.html を書き出しました（${(page.length / 1024).toFixed(1)} KB）`);
