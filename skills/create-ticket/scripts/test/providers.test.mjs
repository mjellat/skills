import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest, resolveSecrets, submit, validateConfig } from '../lib/providers/index.mjs';

const ticket = { title: 'Login fails', body: '## Summary\n**Boom**', labels: ['bug', 'needs triage'], assignees: ['octocat'], type: null };

const github = { provider: 'github', github: { repo: 'acme/app' } };
const gitlab = { provider: 'gitlab', gitlab: { project: 'group/sub/app' } };
const jira = { provider: 'jira', jira: { baseUrl: 'https://acme.atlassian.net/', projectKey: 'ABC' } };

const SECRET = 's3cr3t-token-value';

function fakeFetch(respond) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return respond(url, init);
  };
  fn.calls = calls;
  return fn;
}
const reply = (status, body) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });

test('validateConfig explains what is wrong', () => {
  assert.match(validateConfig(null)[0], /JSON object/);
  assert.match(validateConfig({ provider: 'trello' })[0], /one of: github, gitlab, jira/);
  assert.match(validateConfig({ provider: 'github' })[0], /missing "github" settings block/);
  assert.match(validateConfig({ provider: 'github', github: { repo: 'nope' } })[0], /owner\/name/);
  assert.match(validateConfig({ provider: 'gitlab', gitlab: {} })[0], /gitlab\.project/);
  assert.match(validateConfig({ provider: 'jira', jira: { projectKey: 'ABC' } })[0], /jira\.baseUrl/);
  assert.match(validateConfig({ provider: 'jira', jira: { baseUrl: 'https://a.test', projectKey: '1' } })[0], /projectKey/);
  assert.match(validateConfig({ provider: 'jira', jira: { baseUrl: 'https://a.test', projectKey: 'AB', auth: 'x' } })[0], /basic/);
  assert.deepEqual(validateConfig(github), []);
  assert.deepEqual(validateConfig(gitlab), []);
  assert.deepEqual(validateConfig(jira), []);
});

test('plain http is rejected except for localhost', () => {
  assert.match(validateConfig({ provider: 'gitlab', gitlab: { project: 'a/b', baseUrl: 'http://git.corp.test' } })[0], /https/);
  assert.deepEqual(validateConfig({ provider: 'gitlab', gitlab: { project: 'a/b', baseUrl: 'http://localhost:8080' } }), []);
});

test('github request', () => {
  const req = buildRequest(github, ticket);
  assert.equal(req.url, 'https://api.github.com/repos/acme/app/issues');
  assert.deepEqual(req.body, { title: 'Login fails', body: '## Summary\n**Boom**', labels: ['bug', 'needs triage'], assignees: ['octocat'] });
  assert.deepEqual(req.warnings, []);
});

test('github enterprise url and omitted empty arrays', () => {
  const cfg = { provider: 'github', github: { repo: 'a/b', apiUrl: 'https://ghe.corp.test/api/v3/' } };
  const req = buildRequest(cfg, { ...ticket, labels: [], assignees: [] });
  assert.equal(req.url, 'https://ghe.corp.test/api/v3/repos/a/b/issues');
  assert.deepEqual(Object.keys(req.body), ['title', 'body']);
});

test('gitlab request encodes the project path and warns about assignees', () => {
  const req = buildRequest(gitlab, ticket);
  assert.equal(req.url, 'https://gitlab.com/api/v4/projects/group%2Fsub%2Fapp/issues');
  assert.deepEqual(req.body, { title: 'Login fails', description: '## Summary\n**Boom**', labels: 'bug,needs triage' });
  assert.match(req.warnings[0], /assignees/);
});

test('jira request converts the description and normalises labels', () => {
  const req = buildRequest(jira, ticket);
  assert.equal(req.url, 'https://acme.atlassian.net/rest/api/2/issue');
  assert.deepEqual(req.body.fields, {
    project: { key: 'ABC' },
    summary: 'Login fails',
    description: 'h2. Summary\n*Boom*',
    issuetype: { name: 'Task' },
    labels: ['bug', 'needs-triage'],
  });
  assert.match(req.warnings[0], /assignees/);
});

test('jira issue type: ticket type beats config default beats "Task"', () => {
  const withDefault = { provider: 'jira', jira: { ...jira.jira, defaultIssueType: 'Story' } };
  assert.equal(buildRequest(withDefault, ticket).body.fields.issuetype.name, 'Story');
  assert.equal(buildRequest(withDefault, { ...ticket, type: 'Bug' }).body.fields.issuetype.name, 'Bug');
});

test('jira rejects titles over 255 characters before sending anything', () => {
  assert.throws(() => buildRequest(jira, { ...ticket, title: 'x'.repeat(256) }), /at most 255/);
});

test('resolveSecrets reports names and status, never values', () => {
  const { missing, status } = resolveSecrets(jira, { JIRA_API_TOKEN: SECRET });
  assert.deepEqual(missing, ['JIRA_EMAIL']);
  assert.deepEqual(status, { email: { names: ['JIRA_EMAIL'], set: false }, token: { names: ['JIRA_API_TOKEN'], set: true } });
  assert.ok(!JSON.stringify(status).includes(SECRET));
});

test('github falls back from GITHUB_TOKEN to GH_TOKEN, tokenEnv overrides both', () => {
  assert.deepEqual(resolveSecrets(github, { GH_TOKEN: SECRET }).missing, []);
  assert.deepEqual(resolveSecrets({ provider: 'github', github: { repo: 'a/b', tokenEnv: 'MY_TOKEN' } }, { GH_TOKEN: SECRET }).missing, ['MY_TOKEN']);
});

test('submit sends the right request and returns url and id (github)', async () => {
  const fetchImpl = fakeFetch(() => reply(201, { html_url: 'https://github.com/acme/app/issues/7', number: 7 }));
  const result = await submit(github, ticket, { env: { GITHUB_TOKEN: SECRET }, fetchImpl });

  assert.deepEqual(result, { provider: 'github', id: '#7', url: 'https://github.com/acme/app/issues/7', warnings: [] });
  const { url, init } = fetchImpl.calls[0];
  assert.equal(url, 'https://api.github.com/repos/acme/app/issues');
  assert.equal(init.method, 'POST');
  assert.equal(init.redirect, 'error');
  assert.equal(init.headers.Authorization, `Bearer ${SECRET}`);
  assert.equal(JSON.parse(init.body).title, 'Login fails');
});

test('submit authenticates gitlab with PRIVATE-TOKEN', async () => {
  const fetchImpl = fakeFetch(() => reply(201, { web_url: 'https://gitlab.com/g/a/-/issues/3', iid: 3 }));
  const result = await submit(gitlab, ticket, { env: { GITLAB_TOKEN: SECRET }, fetchImpl });
  assert.equal(result.url, 'https://gitlab.com/g/a/-/issues/3');
  assert.equal(result.id, '#3');
  assert.equal(fetchImpl.calls[0].init.headers['PRIVATE-TOKEN'], SECRET);
  assert.equal(fetchImpl.calls[0].init.headers.Authorization, undefined);
});

test('submit authenticates jira with basic auth or bearer', async () => {
  const ok = () => reply(201, { key: 'ABC-12' });

  const basic = fakeFetch(ok);
  const result = await submit(jira, ticket, { env: { JIRA_EMAIL: 'me@acme.test', JIRA_API_TOKEN: SECRET }, fetchImpl: basic });
  assert.equal(result.url, 'https://acme.atlassian.net/browse/ABC-12');
  assert.equal(result.id, 'ABC-12');
  const expected = `Basic ${Buffer.from(`me@acme.test:${SECRET}`).toString('base64')}`;
  assert.equal(basic.calls[0].init.headers.Authorization, expected);

  const bearer = fakeFetch(ok);
  const dc = { provider: 'jira', jira: { ...jira.jira, auth: 'bearer' } };
  await submit(dc, ticket, { env: { JIRA_API_TOKEN: SECRET }, fetchImpl: bearer });
  assert.equal(bearer.calls[0].init.headers.Authorization, `Bearer ${SECRET}`);
});

test('submit refuses to run without credentials and does not touch the network', async () => {
  const fetchImpl = fakeFetch(() => reply(201, {}));
  await assert.rejects(submit(github, ticket, { env: {}, fetchImpl }), /Missing environment variable: GITHUB_TOKEN or GH_TOKEN/);
  assert.equal(fetchImpl.calls.length, 0);
});

test('submit refuses an invalid config', async () => {
  const fetchImpl = fakeFetch(() => reply(201, {}));
  await assert.rejects(submit({ provider: 'github', github: {} }, ticket, { env: { GITHUB_TOKEN: SECRET }, fetchImpl }), /Invalid configuration/);
  assert.equal(fetchImpl.calls.length, 0);
});

test('HTTP errors surface status and message with the token redacted', async () => {
  const fetchImpl = fakeFetch(() => reply(422, { message: `Validation failed for ${SECRET}` }));
  await assert.rejects(
    submit(github, ticket, { env: { GITHUB_TOKEN: SECRET }, fetchImpl }),
    (err) => /HTTP 422/.test(err.message) && /Validation failed/.test(err.message) && !err.message.includes(SECRET),
  );
  assert.equal(fetchImpl.calls.length, 1, 'must not retry');
});

test('network failures warn that the ticket may exist', async () => {
  const fetchImpl = fakeFetch(() => {
    throw new TypeError('fetch failed', { cause: new Error(`socket hang up ${SECRET}`) });
  });
  await assert.rejects(
    submit(github, ticket, { env: { GITHUB_TOKEN: SECRET }, fetchImpl }),
    (err) => /may or may not have been created/.test(err.message) && !err.message.includes(SECRET),
  );
});

test('a 2xx answer without JSON or without a url is reported as uncertain', async () => {
  await assert.rejects(
    submit(github, ticket, { env: { GITHUB_TOKEN: SECRET }, fetchImpl: fakeFetch(() => reply(200, '<html>proxy</html>')) }),
    /not with JSON.*may or may not/,
  );
  await assert.rejects(
    submit(github, ticket, { env: { GITHUB_TOKEN: SECRET }, fetchImpl: fakeFetch(() => reply(200, {})) }),
    /without a ticket URL/,
  );
});

test('buildRequest output is secret-free by construction', () => {
  for (const config of [github, gitlab, jira]) {
    assert.ok(!JSON.stringify(buildRequest(config, ticket)).includes(SECRET));
  }
});
