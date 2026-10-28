import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addComment, getTicket, hashBody, planComment, planUpdate, updateTicket } from '../lib/trackers/index.mjs';
import * as gh from '../lib/trackers/github.mjs';
import * as gl from '../lib/trackers/gitlab.mjs';
import * as jr from '../lib/trackers/jira.mjs';

const SECRET = 's3cr3t-token-value';

const github = { provider: 'github', github: { repo: 'acme/app' } };
const gitlab = { provider: 'gitlab', gitlab: { project: 'group/sub/app' } };
const jira = { provider: 'jira', jira: { baseUrl: 'https://acme.atlassian.net', projectKey: 'ABC' } };
const env = { GITHUB_TOKEN: SECRET, GITLAB_TOKEN: SECRET, JIRA_API_TOKEN: SECRET, JIRA_EMAIL: 'me@acme.test' };

function fakeFetch(...responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error(`unexpected request to ${url}`);
    return typeof next === 'function' ? next() : next;
  };
  fn.calls = calls;
  return fn;
}
const reply = (status, body) =>
  new Response(body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body), { status });

const ghIssue = { number: 7, title: 'Old title', body: 'Old body', state: 'open', html_url: 'https://github.com/acme/app/issues/7', labels: [{ name: 'enhancement' }], assignees: [{ login: 'octocat' }] };
const jiraIssue = { key: 'ABC-12', fields: { summary: 'Old summary', description: 'h2. Old', status: { name: 'To Do' }, issuetype: { name: 'Story' }, labels: ['x'], assignee: { displayName: 'Pat' } } };

test('github refs: number, #number and URLs of the configured repository', () => {
  const cfg = github.github;
  assert.equal(gh.parseRef('12', cfg), '12');
  assert.equal(gh.parseRef('#12', cfg), '12');
  assert.equal(gh.parseRef('https://github.com/Acme/App/issues/12', cfg), '12');
  assert.equal(gh.parseRef('https://ghe.corp.test/a/b/issues/3', { repo: 'a/b', apiUrl: 'https://ghe.corp.test/api/v3' }), '3');
  assert.throws(() => gh.parseRef('https://github.com/other/repo/issues/12', cfg), /configured repository is acme\/app/);
  assert.throws(() => gh.parseRef('https://github.com/acme/app/pull/12', cfg), /pull request/);
  assert.throws(() => gh.parseRef('https://evil.test/acme/app/issues/12', cfg), /not an issue URL on github\.com/);
  assert.throws(() => gh.parseRef('twelve', cfg), /Cannot read "twelve"/);
});

test('gitlab refs', () => {
  const cfg = gitlab.gitlab;
  assert.equal(gl.parseRef('5', cfg), '5');
  assert.equal(gl.parseRef('https://gitlab.com/group/sub/app/-/issues/5', cfg), '5');
  assert.throws(() => gl.parseRef('https://gitlab.com/other/app/-/issues/5', cfg), /configured project is group\/sub\/app/);
  assert.equal(gl.parseRef('https://gitlab.com/any/path/-/issues/5', { project: 42 }), '5');
  assert.throws(() => gl.parseRef('https://evil.test/group/sub/app/-/issues/5', cfg), /not an issue URL on gitlab\.com/);
});

test('jira refs', () => {
  const cfg = jira.jira;
  assert.equal(jr.parseRef('abc-12', cfg), 'ABC-12');
  assert.equal(jr.parseRef('https://acme.atlassian.net/browse/XYZ-3', cfg), 'XYZ-3');
  assert.throws(() => jr.parseRef('https://evil.test/browse/ABC-12', cfg), /not an issue URL on acme\.atlassian\.net/);
  assert.throws(() => jr.parseRef('12', cfg), /Cannot read "12"/);
});

test('trackers turn their API answers into one ticket shape', () => {
  assert.deepEqual(gh.normalize(ghIssue), {
    id: '#7', url: 'https://github.com/acme/app/issues/7', title: 'Old title', body: 'Old body', format: 'markdown',
    state: 'open', type: null, labels: ['enhancement'], assignees: ['octocat'],
  });
  assert.throws(() => gh.normalize({ ...ghIssue, pull_request: {} }), /pull request/);

  const glIssue = { iid: 5, title: 'T', description: null, state: 'opened', web_url: 'https://gitlab.com/g/-/issues/5', labels: ['bug'], assignees: [{ username: 'sam' }] };
  const normalized = gl.normalize(glIssue);
  assert.deepEqual([normalized.id, normalized.body, normalized.labels, normalized.assignees], ['#5', '', ['bug'], ['sam']]);

  const j = jr.normalize(jiraIssue, jira.jira);
  assert.deepEqual([j.id, j.url, j.title, j.format, j.type, j.state, j.assignees], ['ABC-12', 'https://acme.atlassian.net/browse/ABC-12', 'Old summary', 'jira-wiki', 'Story', 'To Do', ['Pat']]);
});

test('write requests per tracker', () => {
  const ticket = { title: 'New', body: '## Scope\n**in**' };
  assert.deepEqual(gh.update('7', ticket, github.github), { method: 'PATCH', url: 'https://api.github.com/repos/acme/app/issues/7', body: { title: 'New', body: '## Scope\n**in**' } });
  assert.equal(gh.comment('7', 'hi', github.github).url, 'https://api.github.com/repos/acme/app/issues/7/comments');

  const glUpdate = gl.update('5', ticket, gitlab.gitlab);
  assert.equal(glUpdate.method, 'PUT');
  assert.equal(glUpdate.url, 'https://gitlab.com/api/v4/projects/group%2Fsub%2Fapp/issues/5');
  assert.deepEqual(glUpdate.body, { title: 'New', description: '## Scope\n**in**' });
  assert.ok(gl.comment('5', 'hi', gitlab.gitlab).url.endsWith('/issues/5/notes'));

  const jrUpdate = jr.update('ABC-12', ticket, jira.jira);
  assert.equal(jrUpdate.method, 'PUT');
  assert.deepEqual(jrUpdate.body, { fields: { summary: 'New', description: 'h2. Scope\n*in*' } });
  assert.deepEqual(jr.comment('ABC-12', '**done**', jira.jira).body, { body: '*done*' });
});

test('getTicket reads with the right auth and adds a body hash', async () => {
  const fetchImpl = fakeFetch(reply(200, ghIssue));
  const ticket = await getTicket(github, '#7', { env, fetchImpl });
  assert.equal(ticket.provider, 'github');
  assert.equal(ticket.title, 'Old title');
  assert.equal(ticket.bodyHash, hashBody('Old body'));
  assert.match(ticket.bodyHash, /^[0-9a-f]{16}$/);
  assert.equal(fetchImpl.calls[0].init.method, 'GET');
  assert.equal(fetchImpl.calls[0].init.headers.Authorization, `Bearer ${SECRET}`);
  assert.equal(fetchImpl.calls[0].init.body, undefined);
});

test('getTicket needs credentials and never reaches the network without them', async () => {
  const fetchImpl = fakeFetch(reply(200, ghIssue));
  await assert.rejects(getTicket(github, '7', { env: {}, fetchImpl }), /Missing environment variable: GITHUB_TOKEN or GH_TOKEN/);
  assert.equal(fetchImpl.calls.length, 0);
});

test('planUpdate and planComment are offline and secret-free', () => {
  const plan = planUpdate(jira, 'abc-12', { title: 'New', body: '**b**' });
  assert.deepEqual([plan.provider, plan.method, plan.url], ['jira', 'PUT', 'https://acme.atlassian.net/rest/api/2/issue/ABC-12']);
  assert.equal(plan.body.fields.description, '*b*');
  assert.equal(planComment(github, '7', 'hi').body.body, 'hi');
  assert.throws(() => planUpdate({ provider: 'github', github: {} }, '7', { title: 't', body: 'b' }), /Invalid configuration/);
});

test('updateTicket reads first, saves a backup, then writes', async () => {
  const backupDir = mkdtempSync(join(tmpdir(), 'refine-backup-'));
  const fetchImpl = fakeFetch(reply(200, ghIssue), reply(200, { ...ghIssue, title: 'New' }));
  const result = await updateTicket(github, '7', { title: 'New', body: 'New body' }, { env, fetchImpl, backupDir });

  assert.deepEqual(fetchImpl.calls.map((c) => c.init.method), ['GET', 'PATCH']);
  assert.deepEqual(JSON.parse(fetchImpl.calls[1].init.body), { title: 'New', body: 'New body' });
  assert.equal(result.ok, true);
  assert.equal(result.id, '#7');

  const saved = JSON.parse(readFileSync(result.backup, 'utf8'));
  assert.equal(saved.title, 'Old title');
  assert.equal(saved.body, 'Old body');
  assert.ok(!JSON.stringify(saved).includes(SECRET));
});

test('updateTicket refuses to overwrite a ticket that changed after it was read', async () => {
  const backupDir = mkdtempSync(join(tmpdir(), 'refine-backup-'));
  const fetchImpl = fakeFetch(reply(200, ghIssue));
  await assert.rejects(
    updateTicket(github, '7', { title: 'New', body: 'New body' }, { env, fetchImpl, backupDir, expectHash: hashBody('what I read earlier') }),
    /edited after you read it.*Nothing was changed/,
  );
  assert.equal(fetchImpl.calls.length, 1, 'only the read, no write');
  assert.deepEqual(readdirSync(backupDir), []);
});

test('updateTicket proceeds when the expected hash still matches', async () => {
  const backupDir = mkdtempSync(join(tmpdir(), 'refine-backup-'));
  const fetchImpl = fakeFetch(reply(200, ghIssue), reply(200, ghIssue));
  const result = await updateTicket(github, '7', { title: 'New', body: 'B' }, { env, fetchImpl, backupDir, expectHash: hashBody('Old body') });
  assert.equal(result.ok, true);
});

test('jira update accepts the empty 204 answer', async () => {
  const backupDir = mkdtempSync(join(tmpdir(), 'refine-backup-'));
  const fetchImpl = fakeFetch(reply(200, jiraIssue), reply(204));
  const result = await updateTicket(jira, 'ABC-12', { title: 'New', body: '## Scope' }, { env, fetchImpl, backupDir });
  assert.equal(result.id, 'ABC-12');
  assert.equal(fetchImpl.calls[1].init.method, 'PUT');
  assert.equal(JSON.parse(fetchImpl.calls[1].init.body).fields.description, 'h2. Scope');
  assert.match(fetchImpl.calls[0].init.headers.Authorization, /^Basic /);
});

test('addComment returns the comment url where the tracker gives one', async () => {
  const gh201 = fakeFetch(reply(201, { html_url: 'https://github.com/acme/app/issues/7#issuecomment-1' }));
  const posted = await addComment(github, '7', 'Refined.', { env, fetchImpl: gh201 });
  assert.deepEqual(posted, { ok: true, provider: 'github', ticket: '#7', commentUrl: 'https://github.com/acme/app/issues/7#issuecomment-1' });

  const jr201 = fakeFetch(reply(201, { id: '1001' }));
  const jiraPosted = await addComment(jira, 'abc-12', 'Refined.', { env, fetchImpl: jr201 });
  assert.deepEqual([jiraPosted.ticket, jiraPosted.commentUrl], ['ABC-12', null]);
});

test('a lost answer to a comment is reported as uncertain, a lost update is not', async () => {
  const lost = () => {
    throw new TypeError('fetch failed', { cause: new Error(`socket hang up ${SECRET}`) });
  };
  await assert.rejects(
    addComment(github, '7', 'x', { env, fetchImpl: fakeFetch(lost) }),
    (err) => /may or may not have gone through/.test(err.message) && !err.message.includes(SECRET),
  );
  await assert.rejects(
    getTicket(github, '7', { env, fetchImpl: fakeFetch(lost) }),
    (err) => !/may or may not/.test(err.message) && !err.message.includes(SECRET),
  );
});

test('HTTP errors show status and message but never the token', async () => {
  const fetchImpl = fakeFetch(reply(404, { message: `Not Found ${SECRET}` }));
  await assert.rejects(
    getTicket(github, '7', { env, fetchImpl }),
    (err) => /HTTP 404/.test(err.message) && /Not Found/.test(err.message) && !err.message.includes(SECRET),
  );
});

test('requests refuse redirects', async () => {
  const fetchImpl = fakeFetch(reply(200, ghIssue));
  await getTicket(github, '7', { env, fetchImpl });
  assert.equal(fetchImpl.calls[0].init.redirect, 'error');
});

test('a pull request is rejected even when it is read by number', async () => {
  const fetchImpl = fakeFetch(reply(200, { ...ghIssue, pull_request: { url: 'x' } }));
  await assert.rejects(getTicket(github, '7', { env, fetchImpl }), /pull request/);
});
