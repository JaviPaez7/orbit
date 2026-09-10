/**
 * One-off migration: pages used to pass `onCreateIssue={() => undefined}` to the
 * global <Header>. Now that AppShell owns the composer, they pull the real
 * handlers from context instead.
 *
 * Run with: node scripts/rewire-headers.mjs
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pagesDir = join(root, 'apps', 'web', 'src', 'pages');

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.tsx') ? [full] : [];
  });
}

let touched = 0;
for (const file of walk(pagesDir)) {
  let source = readFileSync(file, 'utf8');
  if (!source.includes('onCreateIssue={() => undefined}')) continue;

  source = source.replace(
    /onCreateIssue=\{\(\) => undefined\}\n(\s*)onOpenSearch=\{\(\) => undefined\}/g,
    'onCreateIssue={() => openComposer()}\n$1onOpenSearch={openSearch}',
  );

  // Insert the hook call right after the component's first hook line.
  if (!source.includes('useIssueComposer')) {
    const relative = file.includes(`${'settings'}`)
      ? '../../context/IssueComposerContext'
      : '../context/IssueComposerContext';
    source = source.replace(
      /^(import .*\n)(?![\s\S]*useIssueComposer)/m,
      `$1import { useIssueComposer } from '${relative}';\n`,
    );

    // Add the hook inside the default-exported component.
    source = source.replace(
      /(export default function \w+\([^)]*\)\s*\{\n)/,
      '$1  const { openComposer, openSearch } = useIssueComposer();\n',
    );
  }

  writeFileSync(file, source, 'utf8');
  touched += 1;
  console.log(`rewired ${file.replace(root, '')}`);
}

console.log(`\n${touched} file(s) updated`);
