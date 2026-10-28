#!/usr/bin/env node
// Skills are installed one by one, so a skill cannot import from a sibling or
// from the repository root. Code and docs that several skills need live once
// in shared/ and are copied into each skill by this script.
//
//   node scripts/sync-shared.mjs          write the copies
//   node scripts/sync-shared.mjs --check  exit 1 if a copy is missing or differs

import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const SKILLS = ['create-ticket', 'refine-ticket'];

// [source in the repo root, destination inside each skill]
export const FILES = [
  ['shared/lib/url.mjs', 'scripts/lib/shared/url.mjs'],
  ['shared/lib/config-file.mjs', 'scripts/lib/shared/config-file.mjs'],
  ['shared/lib/connection.mjs', 'scripts/lib/shared/connection.mjs'],
  ['shared/lib/frontmatter.mjs', 'scripts/lib/shared/frontmatter.mjs'],
  ['shared/lib/ticket.mjs', 'scripts/lib/shared/ticket.mjs'],
  ['shared/lib/markdown-to-jira.mjs', 'scripts/lib/shared/markdown-to-jira.mjs'],
  ['shared/docs/config.md', 'references/config.md'],
];

export function expectedContent(from) {
  const note = `Copy of ${from}. Edit the original and run "node scripts/sync-shared.mjs".`;
  const source = readFileSync(join(ROOT, from), 'utf8');
  return from.endsWith('.md') ? `<!-- ${note} -->\n${source}` : `// ${note}\n${source}`;
}

export function copies() {
  return SKILLS.flatMap((skill) =>
    FILES.map(([from, to]) => ({ from, path: join(ROOT, 'skills', skill, to), content: expectedContent(from) })),
  );
}

export function outOfSync() {
  return copies().filter(({ path, content }) => !existsSync(path) || readFileSync(path, 'utf8') !== content);
}

function main(args) {
  if (args.includes('--check')) {
    const stale = outOfSync();
    for (const { path } of stale) console.error(`out of sync: ${path.slice(ROOT.length + 1)}`);
    if (stale.length) console.error('Run: node scripts/sync-shared.mjs');
    return stale.length ? 1 : 0;
  }
  for (const { path, content } of copies()) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  console.log(`Synced ${FILES.length} files into ${SKILLS.length} skills.`);
  return 0;
}

const entry = process.argv[1] && realpathSync(process.argv[1]);
if (entry && import.meta.url === pathToFileURL(entry).href) process.exitCode = main(process.argv.slice(2));
