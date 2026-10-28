import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROOT, copies, outOfSync } from '../scripts/sync-shared.mjs';

test('every skill holds an up-to-date copy of the shared files', () => {
  const stale = outOfSync().map(({ path }) => path.slice(ROOT.length + 1));
  assert.deepEqual(stale, [], 'run "node scripts/sync-shared.mjs" after editing shared/');
});

test('copies announce where they come from', () => {
  for (const { path, from } of copies()) {
    const firstLine = readFileSync(path, 'utf8').split('\n')[0];
    assert.match(firstLine, new RegExp(`Copy of ${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  }
});
