import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../create-ticket.mjs';

const SECRET = 's3cr3t-token-value';
const SKILL_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function sandbox({ config, templates = {}, draft } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'create-ticket-cli-'));
  const project = join(root, 'project');
  const bundled = join(root, 'bundled');
  mkdirSync(join(project, '.tickets'), { recursive: true });
  mkdirSync(bundled);
  if (config) writeFileSync(join(project, '.tickets', 'config.json'), JSON.stringify(config));
  for (const [name, content] of Object.entries(templates)) writeFileSync(join(bundled, `${name}.md`), content);
  const draftPath = join(root, 'draft.md');
  if (draft) writeFileSync(draftPath, draft);
  return { root, project, draftPath, io: { cwd: project, home: join(root, 'home'), bundledDir: bundled } };
}

async function run(argv, io) {
  let stdout = '';
  let stderr = '';
  const code = await main(argv, { env: {}, ...io, out: (t) => (stdout += t), err: (t) => (stderr += t) });
  return { code, stdout, stderr, json: () => JSON.parse(stdout) };
}

const github = { provider: 'github', github: { repo: 'acme/app' } };
const draft = '---\nlabels: [bug]\n---\n# Login fails\n\n## Summary\nBoom';

test('no command or an unknown command is a usage error', async () => {
  assert.equal((await run([], {})).code, 2);
  const unknown = await run(['frobnicate'], {});
  assert.equal(unknown.code, 2);
  assert.match(unknown.stderr, /Unknown command "frobnicate"/);
});

test('check without a config says where to create one', async () => {
  const { io } = sandbox();
  const result = await run(['check'], io);
  assert.equal(result.code, 0);
  assert.equal(result.json().configured, false);
  assert.match(result.json().createAt, /\.tickets\/config\.json$/);
});

test('check reports credential status without leaking values', async () => {
  const { io } = sandbox({ config: github });

  const missing = await run(['check'], io);
  assert.equal(missing.json().ready, false);
  assert.equal(missing.json().credentials.token.set, false);

  const ready = await run(['check'], { ...io, env: { GITHUB_TOKEN: SECRET } });
  assert.equal(ready.json().ready, true);
  assert.equal(ready.json().provider, 'github');
  assert.ok(!ready.stdout.includes(SECRET));
});

test('check surfaces config problems and unreadable JSON', async () => {
  const bad = await run(['check'], sandbox({ config: { provider: 'github', github: {} } }).io);
  assert.equal(bad.json().ready, false);
  assert.match(bad.json().problems[0], /owner\/name/);

  const { io, project } = sandbox();
  writeFileSync(join(project, '.tickets', 'config.json'), '{ nope');
  const broken = await run(['check'], io);
  assert.equal(broken.code, 1);
  assert.match(broken.stderr, /Cannot parse/);
});

test('templates and show', async () => {
  const { io } = sandbox({ templates: { bug: '---\ndescription: A bug\n---\n# {{title}}' } });
  const list = await run(['templates'], io);
  assert.deepEqual(list.json(), [{ name: 'bug', description: 'A bug', source: 'bundled' }]);

  const shown = await run(['show', 'bug'], io);
  assert.equal(shown.stdout, '---\ndescription: A bug\n---\n# {{title}}');
  assert.equal((await run(['show', 'nope'], io)).code, 1);
  assert.equal((await run(['show'], io)).code, 2);
});

test('create validates its arguments', async () => {
  const { io } = sandbox({ config: github });
  assert.equal((await run(['create'], io)).code, 2);
  assert.equal((await run(['create', '--file', '/does/not/exist.md'], io)).code, 2);
  assert.equal((await run(['create', '--bogus'], io)).code, 2);
});

test('create without a config exits 3 and sends nothing', async () => {
  const { io, draftPath } = sandbox({ draft });
  let called = false;
  const result = await run(['create', '--file', draftPath], { ...io, fetchImpl: () => (called = true) });
  assert.equal(result.code, 3);
  assert.match(result.stderr, /No ticket system configured/);
  assert.equal(called, false);
});

test('--dry-run prints the request, flags missing credentials and never calls fetch', async () => {
  const { io, draftPath } = sandbox({ config: github, draft });
  let called = false;
  const result = await run(['create', '--file', draftPath, '--dry-run'], { ...io, env: {}, fetchImpl: () => (called = true) });
  assert.equal(result.code, 0);
  assert.equal(called, false);
  const out = result.json();
  assert.equal(out.dryRun, true);
  assert.equal(out.url, 'https://api.github.com/repos/acme/app/issues');
  assert.deepEqual(out.body, { title: 'Login fails', body: '## Summary\nBoom', labels: ['bug'] });
  assert.deepEqual(out.missingCredentials, ['GITHUB_TOKEN or GH_TOKEN']);
});

test('--dry-run output never contains the token', async () => {
  const { io, draftPath } = sandbox({ config: github, draft });
  const result = await run(['create', '--file', draftPath, '--dry-run'], { ...io, env: { GITHUB_TOKEN: SECRET } });
  assert.equal(result.code, 0);
  assert.ok(!result.stdout.includes(SECRET));
});

test('create posts the ticket and prints the url', async () => {
  const { io, draftPath } = sandbox({ config: github, draft });
  const fetchImpl = async () => new Response(JSON.stringify({ html_url: 'https://github.com/acme/app/issues/9', number: 9 }), { status: 201 });
  const result = await run(['create', '--file', draftPath], { ...io, env: { GITHUB_TOKEN: SECRET }, fetchImpl });
  assert.equal(result.code, 0);
  assert.deepEqual(result.json(), { ok: true, provider: 'github', id: '#9', url: 'https://github.com/acme/app/issues/9', warnings: [] });
});

test('a rejected create exits 1 with the API message and no token', async () => {
  const { io, draftPath } = sandbox({ config: github, draft });
  const fetchImpl = async () => new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
  const result = await run(['create', '--file', draftPath], { ...io, env: { GITHUB_TOKEN: SECRET }, fetchImpl });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /HTTP 404.*Not Found/);
  assert.ok(!result.stderr.includes(SECRET));
});

test('the script runs when started through a symlink, as in the default skills install', () => {
  const root = mkdtempSync(join(tmpdir(), 'create-ticket-link-'));
  const link = join(root, 'installed-skill');
  symlinkSync(SKILL_DIR, link);
  const cwd = join(root, 'empty');
  mkdirSync(cwd);

  const result = spawnSync(process.execPath, [join(link, 'scripts', 'create-ticket.mjs'), 'check'], {
    cwd,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, TICKET_SKILL_HOME: join(root, 'global') },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).configured, false);
});
