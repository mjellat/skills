import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../refine-ticket.mjs';
import { hashBody } from '../lib/trackers/index.mjs';

const SECRET = 's3cr3t-token-value';
const SKILL_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const github = { provider: 'github', github: { repo: 'acme/app' } };
const issue = { number: 7, title: 'Old title', body: 'Old body', state: 'open', html_url: 'https://github.com/acme/app/issues/7', labels: [], assignees: [] };
const refined = '# Refined title\n\n## Scope\nIn: the letter. Out: the refund.\n';

function sandbox({ config, files = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'refine-cli-'));
  const project = join(root, 'project');
  mkdirSync(join(project, '.tickets'), { recursive: true });
  mkdirSync(join(project, '.git'));
  if (config) writeFileSync(join(project, '.tickets', 'config.json'), JSON.stringify(config));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(project, rel)), { recursive: true });
    writeFileSync(join(project, rel), content);
  }
  const file = join(root, 'refined.md');
  writeFileSync(file, refined);
  return { root, project, file, io: { cwd: project, home: join(root, 'home'), backupDir: join(root, 'backups') } };
}

function fakeFetch(...responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return responses.shift() ?? new Response('{}', { status: 500 });
  };
  fn.calls = calls;
  return fn;
}
const reply = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status });

async function run(argv, io) {
  let stdout = '';
  let stderr = '';
  const code = await main(argv, { env: {}, ...io, out: (t) => (stdout += t), err: (t) => (stderr += t) });
  return { code, stdout, stderr, json: () => JSON.parse(stdout) };
}

test('no command or an unknown command is a usage error', async () => {
  assert.equal((await run([], {})).code, 2);
  const unknown = await run(['frobnicate'], {});
  assert.equal(unknown.code, 2);
  assert.match(unknown.stderr, /Unknown command "frobnicate"/);
});

test('check without a config explains that pasted text still works', async () => {
  const { io } = sandbox();
  const result = await run(['check'], io);
  assert.equal(result.code, 0);
  assert.equal(result.json().configured, false);
  assert.match(result.json().hint, /paste/);
});

test('check reports credential status without leaking values', async () => {
  const { io } = sandbox({ config: github });
  assert.equal((await run(['check'], io)).json().ready, false);
  const ready = await run(['check'], { ...io, env: { GITHUB_TOKEN: SECRET } });
  assert.equal(ready.json().ready, true);
  assert.ok(!ready.stdout.includes(SECRET));
});

test('get without a config exits 3, without a reference exits 2', async () => {
  const { io } = sandbox();
  assert.equal((await run(['get', '7'], io)).code, 3);
  const { io: configured } = sandbox({ config: github });
  assert.equal((await run(['get'], configured)).code, 2);
});

test('get prints the ticket with its body hash', async () => {
  const { io } = sandbox({ config: github });
  const result = await run(['get', '7'], { ...io, env: { GITHUB_TOKEN: SECRET }, fetchImpl: fakeFetch(reply(200, issue)) });
  assert.equal(result.code, 0);
  assert.equal(result.json().title, 'Old title');
  assert.equal(result.json().bodyHash, hashBody('Old body'));
  assert.ok(!result.stdout.includes(SECRET));
});

test('update --dry-run shows the request and sends nothing', async () => {
  const { io, file } = sandbox({ config: github });
  const fetchImpl = fakeFetch();
  const result = await run(['update', '7', '--file', file, '--dry-run'], { ...io, env: { GITHUB_TOKEN: SECRET }, fetchImpl });
  assert.equal(result.code, 0);
  assert.equal(fetchImpl.calls.length, 0);
  assert.deepEqual(result.json(), {
    dryRun: true,
    provider: 'github',
    method: 'PATCH',
    url: 'https://api.github.com/repos/acme/app/issues/7',
    body: { title: 'Refined title', body: '## Scope\nIn: the letter. Out: the refund.' },
  });
  assert.ok(!result.stdout.includes(SECRET));
});

test('update reads, backs up and writes, and returns the backup path', async () => {
  const { io, file } = sandbox({ config: github });
  const fetchImpl = fakeFetch(reply(200, issue), reply(200, issue));
  const result = await run(['update', '7', '--file', file, '--expect-hash', hashBody('Old body')], { ...io, env: { GITHUB_TOKEN: SECRET }, fetchImpl });
  assert.equal(result.code, 0);
  assert.equal(result.json().ok, true);
  assert.match(result.json().backup, /github-7-.*\.json$/);
  assert.deepEqual(fetchImpl.calls.map((c) => c.init.method), ['GET', 'PATCH']);
});

test('update stops with exit 1 when the ticket changed after it was read', async () => {
  const { io, file } = sandbox({ config: github });
  const fetchImpl = fakeFetch(reply(200, issue));
  const result = await run(['update', '7', '--file', file, '--expect-hash', 'deadbeefdeadbeef'], { ...io, env: { GITHUB_TOKEN: SECRET }, fetchImpl });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /edited after you read it/);
  assert.equal(fetchImpl.calls.length, 1);
});

test('update validates its input', async () => {
  const { io, file, root } = sandbox({ config: github });
  const env = { GITHUB_TOKEN: SECRET };
  assert.equal((await run(['update', '7'], { ...io, env })).code, 2);
  assert.equal((await run(['update', '7', '--file', join(root, 'missing.md')], { ...io, env })).code, 2);
  assert.equal((await run(['update', '--file', file], { ...io, env })).code, 2);

  const noTitle = join(root, 'no-title.md');
  writeFileSync(noTitle, 'just text, no heading');
  const result = await run(['update', '7', '--file', noTitle, '--dry-run'], { ...io, env });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /needs a title/);
});

test('comment --dry-run and real', async () => {
  const { io, root } = sandbox({ config: github });
  const file = join(root, 'comment.md');
  writeFileSync(file, '**Refined.** Decisions: ADR-0006.\n');
  const env = { GITHUB_TOKEN: SECRET };

  const dry = await run(['comment', '7', '--file', file, '--dry-run'], { ...io, env });
  assert.equal(dry.json().body.body, '**Refined.** Decisions: ADR-0006.');
  assert.equal(dry.json().url, 'https://api.github.com/repos/acme/app/issues/7/comments');

  const real = await run(['comment', '7', '--file', file], { ...io, env, fetchImpl: fakeFetch(reply(201, { html_url: 'https://github.com/acme/app/issues/7#c1' })) });
  assert.equal(real.json().commentUrl, 'https://github.com/acme/app/issues/7#c1');

  const empty = join(root, 'empty.md');
  writeFileSync(empty, '\n');
  assert.equal((await run(['comment', '7', '--file', empty], { ...io, env })).code, 2);
});

test('link --dry-run shows the request, link sends it, bad input is a usage error', async () => {
  const { io } = sandbox({ config: github });
  const env = { GITHUB_TOKEN: SECRET };

  const dry = await run(['link', '7', '8', '--dry-run'], { ...io, env });
  assert.equal(dry.code, 0);
  assert.equal(dry.json().url, 'https://api.github.com/repos/acme/app/issues/7/sub_issues');

  const fetchImpl = fakeFetch(reply(200, { ...issue, number: 8, id: 9001 }), reply(201, {}));
  const real = await run(['link', '7', '8'], { ...io, env, fetchImpl });
  assert.deepEqual(real.json(), { ok: true, provider: 'github', parent: '#7', child: '#8' });

  assert.equal((await run(['link', '7'], { ...io, env })).code, 2);
});

test('a ticket from another repository is refused before any request', async () => {
  const { io } = sandbox({ config: github });
  const fetchImpl = fakeFetch(reply(200, issue));
  const result = await run(['get', 'https://github.com/other/repo/issues/7'], { ...io, env: { GITHUB_TOKEN: SECRET }, fetchImpl });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /configured repository is acme\/app/);
  assert.equal(fetchImpl.calls.length, 0);
});

test('the script runs when started through a symlink, as in the default skills install', () => {
  const root = mkdtempSync(join(tmpdir(), 'refine-link-'));
  const link = join(root, 'installed-skill');
  symlinkSync(SKILL_DIR, link);
  const cwd = join(root, 'empty');
  mkdirSync(cwd);

  const result = spawnSync(process.execPath, [join(link, 'scripts', 'refine-ticket.mjs'), 'check'], {
    cwd,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, TICKET_SKILL_HOME: join(root, 'global') },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).configured, false);
});
