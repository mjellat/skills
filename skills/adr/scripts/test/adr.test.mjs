import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { findAdrDir, scanAdrs, slugify } from '../lib/adr.mjs';

function repo() {
  const root = mkdtempSync(join(tmpdir(), 'adr-'));
  mkdirSync(join(root, '.git'));
  return root;
}
function write(root, rel, content) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), content);
}

const NYGARD = (n, title, status, date = '2023-01-05') =>
  `# ${n}. ${title}\n\nDate: ${date}\n\n## Status\n\n${status}\n\n## Context\nWhy.\n\n## Decision\nWhat.\n\n## Consequences\nSo.\n`;
const MADR = (title, status, date) =>
  `---\nstatus: "${status}"\ndate: ${date}\n---\n\n# ${title}\n\n## Context and Problem Statement\nWhy.\n\n## Decision Outcome\nWhat.\n`;

function projectWithAdrs() {
  const root = repo();
  write(root, 'docs/adr/0001-record-architecture-decisions.md', NYGARD(1, 'Record architecture decisions', 'Accepted'));
  write(root, 'docs/adr/0002-use-postgres.md', MADR('Use PostgreSQL for orders', 'accepted', '2024-02-10'));
  write(root, 'docs/adr/0003-old-queue.md', NYGARD(3, 'Use a database table as queue', 'Superseded by [ADR-0005](0005-new-queue.md)'));
  write(root, 'docs/adr/0005-new-queue.md', MADR('Use RabbitMQ as queue', 'accepted', '2024-06-01'));
  write(root, 'docs/adr/README.md', '# Index');
  return root;
}

test('reads number, title, status and date from Nygard and MADR files', () => {
  const result = scanAdrs({ cwd: projectWithAdrs() });
  assert.equal(result.found, true);
  assert.equal(result.dir, 'docs/adr');
  assert.equal(result.total, 4);

  const byNumber = Object.fromEntries(result.adrs.map((adr) => [adr.number, adr]));
  assert.deepEqual(
    [byNumber['0001'].title, byNumber['0001'].status, byNumber['0001'].date],
    ['Record architecture decisions', 'Accepted', '2023-01-05'],
  );
  assert.deepEqual([byNumber['0002'].title, byNumber['0002'].status, byNumber['0002'].date], ['Use PostgreSQL for orders', 'accepted', '2024-02-10']);
  assert.equal(byNumber['0003'].status, 'Superseded by ADR-0005');
  assert.equal(byNumber['0003'].supersededBy, '5');
  assert.equal(byNumber['0005'].supersededBy, null);
  assert.equal(byNumber['0001'].path, 'docs/adr/0001-record-architecture-decisions.md');
  assert.ok(!('text' in byNumber['0001']), 'file contents are not dumped into the result');
});

test('numbers the next ADR after the highest, not after the count', () => {
  const result = scanAdrs({ cwd: projectWithAdrs(), title: 'Use an Event Bus' });
  assert.equal(result.nextNumber, '0006');
  assert.deepEqual(result.next, { fileName: '0006-use-an-event-bus.md', path: 'docs/adr/0006-use-an-event-bus.md' });
});

test('the format is the one most ADRs use', () => {
  const root = repo();
  write(root, 'docs/adr/0001-a.md', MADR('A', 'accepted', '2024-01-01'));
  write(root, 'docs/adr/0002-b.md', MADR('B', 'accepted', '2024-01-02'));
  write(root, 'docs/adr/0003-c.md', NYGARD(3, 'C', 'Accepted'));
  assert.equal(scanAdrs({ cwd: root }).format, 'madr');
});

test('match keeps ADRs that mention a term, best first', () => {
  const result = scanAdrs({ cwd: projectWithAdrs(), match: ['queue', 'rabbitmq'] });
  assert.deepEqual(result.adrs.map((adr) => adr.number), ['0005', '0003']);
  assert.ok(result.adrs.every((adr) => adr.score > 0));
  assert.deepEqual(scanAdrs({ cwd: projectWithAdrs(), match: ['kubernetes'] }).adrs, []);
});

test('keeps the width and the prefix of existing file names', () => {
  const shortRepo = repo();
  write(shortRepo, 'doc/adr/1-first.md', NYGARD(1, 'First', 'Accepted'));
  write(shortRepo, 'doc/adr/2-second.md', NYGARD(2, 'Second', 'Accepted'));
  assert.equal(scanAdrs({ cwd: shortRepo, title: 'Third' }).next.fileName, '3-third.md');

  const prefixed = repo();
  write(prefixed, 'docs/decisions/adr-0001-first.md', NYGARD(1, 'First', 'Accepted'));
  const result = scanAdrs({ cwd: prefixed, title: 'Second' });
  assert.equal(result.dir, 'docs/decisions');
  assert.equal(result.next.fileName, 'adr-0002-second.md');
});

test('without ADRs it suggests a directory and starts at 0001 once one exists', () => {
  const root = repo();
  const none = scanAdrs({ cwd: root });
  assert.deepEqual([none.found, none.suggestedDir], [false, 'docs/adr']);

  mkdirSync(join(root, 'docs', 'adr'), { recursive: true });
  const empty = scanAdrs({ cwd: root, title: 'First decision' });
  assert.deepEqual([empty.found, empty.total, empty.format, empty.nextNumber, empty.next.fileName], [true, 0, 'unknown', '0001', '0001-first-decision.md']);
});

test('.adr-dir names the directory, but not one outside the repository', () => {
  const root = repo();
  write(root, '.adr-dir', 'architecture/records\n');
  write(root, 'architecture/records/0001-x.md', NYGARD(1, 'X', 'Accepted'));
  assert.equal(findAdrDir(root).source, '.adr-dir');
  assert.equal(scanAdrs({ cwd: root }).dir, 'architecture/records');

  const escaping = repo();
  write(escaping, '.adr-dir', '../outside');
  assert.equal(findAdrDir(escaping), null);
});

test('a sub-project with its own ADRs wins over the repository root', () => {
  const root = repo();
  write(root, 'docs/adr/0001-root.md', NYGARD(1, 'Root decision', 'Accepted'));
  write(root, 'services/billing/docs/adr/0001-billing.md', NYGARD(1, 'Billing decision', 'Accepted'));
  const result = scanAdrs({ cwd: join(root, 'services', 'billing') });
  assert.equal(result.adrs[0].title, 'Billing decision');
});

test('links point into the remote, without credentials', () => {
  const root = mkdtempSync(join(tmpdir(), 'adr-git-'));
  execFileSync('git', ['init', '-q', root]);
  execFileSync('git', ['-C', root, 'remote', 'add', 'origin', 'https://someone:tok3n-value@github.com/acme/app.git']);
  write(root, 'docs/adr/0001-x.md', NYGARD(1, 'X', 'Accepted'));

  const result = scanAdrs({ cwd: root });
  assert.equal(result.adrs[0].url, 'https://github.com/acme/app/blob/main/docs/adr/0001-x.md');
  assert.ok(!JSON.stringify(result).includes('tok3n-value'));

  execFileSync('git', ['-C', root, 'remote', 'set-url', 'origin', 'git@gitlab.com:group/proj.git']);
  assert.equal(scanAdrs({ cwd: root }).adrs[0].url, 'https://gitlab.com/group/proj/-/blob/main/docs/adr/0001-x.md');

  execFileSync('git', ['-C', root, 'remote', 'set-url', 'origin', 'https://git.corp.test/x/y.git']);
  assert.equal(scanAdrs({ cwd: root }).adrs[0].url, null);
});

test('slugify makes safe, short file names', () => {
  assert.equal(slugify('Use an Event Bus!'), 'use-an-event-bus');
  assert.equal(slugify('Größe & Übergabe: Äpfel'), 'grosse-ubergabe-apfel');
  assert.equal(slugify('../../etc/passwd'), 'etc-passwd');
  assert.equal(slugify('???'), 'decision');
  assert.ok(slugify('x'.repeat(200)).length <= 60);
});
