import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../adr.mjs';

const SKILL_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function project(files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'adr-cli-'));
  mkdirSync(join(root, '.git'));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
  return root;
}

function run(argv, cwd) {
  let stdout = '';
  let stderr = '';
  const code = main(argv, { cwd, out: (t) => (stdout += t), err: (t) => (stderr += t) });
  return { code, stdout, stderr, json: () => JSON.parse(stdout) };
}

test('no command, an unknown command or an unknown option is a usage error', () => {
  const cwd = project();
  assert.equal(run([], cwd).code, 2);
  assert.equal(run(['frobnicate'], cwd).code, 2);
  assert.equal(run(['list', '--nope'], cwd).code, 2);
});

test('list finds the project ADRs and proposes the next file name', () => {
  const cwd = project({
    'docs/adr/0001-record-architecture-decisions.md': '# 1. Record architecture decisions\n\n## Status\n\nAccepted\n\n## Context\nc\n\n## Decision\nd\n',
    'docs/adr/0002-use-postgres.md': '# 2. Use PostgreSQL\n\n## Status\n\nAccepted\n\n## Context\nOrders need transactions.\n\n## Decision\nd\n',
  });
  const result = run(['list', '--match', 'transactions', '--title', 'Use an event bus'], cwd);
  assert.equal(result.code, 0);
  assert.deepEqual(result.json().adrs.map((adr) => adr.number), ['0002']);
  assert.equal(result.json().next.path, 'docs/adr/0003-use-an-event-bus.md');
});

test('without ADRs it suggests where to create them', () => {
  const result = run(['list'], project());
  assert.equal(result.json().found, false);
  assert.equal(result.json().suggestedDir, 'docs/adr');
});

test('the script runs when started through a symlink, as in the default skills install', () => {
  const root = mkdtempSync(join(tmpdir(), 'adr-link-'));
  const link = join(root, 'installed-skill');
  symlinkSync(SKILL_DIR, link);
  const cwd = join(root, 'empty');
  mkdirSync(cwd);

  const result = spawnSync(process.execPath, [join(link, 'scripts', 'adr.mjs'), 'list'], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).found, false);
});
