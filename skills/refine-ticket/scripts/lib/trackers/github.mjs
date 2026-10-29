import { CONNECTIONS } from '../shared/connection.mjs';

const issueApi = (cfg, id) => `${CONNECTIONS.github.base(cfg)}/repos/${cfg.repo}/issues/${id}`;

// `https://api.github.com` is served from github.com; Enterprise uses one host.
function webHost(cfg) {
  const host = new URL(CONNECTIONS.github.base(cfg)).host;
  return host === 'api.github.com' ? 'github.com' : host;
}

// Accepts 12, #12 or an issue URL of the configured repository.
export function parseRef(ref, cfg) {
  const text = String(ref).trim();
  const number = /^#?(\d+)$/.exec(text);
  if (number) return number[1];

  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`Cannot read "${ref}" as a GitHub issue number or URL`);
  }
  const match = /^\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)\/?$/.exec(url.pathname);
  if (!match || url.host !== webHost(cfg)) throw new Error(`"${ref}" is not an issue URL on ${webHost(cfg)}`);
  if (match[3] === 'pull') throw new Error(`"${ref}" is a pull request, not an issue`);
  if (`${match[1]}/${match[2]}`.toLowerCase() !== cfg.repo.toLowerCase()) {
    throw new Error(`"${ref}" is in ${match[1]}/${match[2]}, but the configured repository is ${cfg.repo}`);
  }
  return match[4];
}

export const get = (id, cfg) => ({ method: 'GET', url: issueApi(cfg, id) });

export function normalize(json) {
  // The issues endpoint also answers for pull requests.
  if (json.pull_request) throw new Error(`#${json.number} is a pull request, not an issue`);
  return {
    id: `#${json.number}`,
    url: json.html_url,
    title: json.title,
    body: json.body ?? '',
    format: 'markdown',
    state: json.state,
    type: null,
    labels: (json.labels ?? []).map((label) => (typeof label === 'string' ? label : label.name)),
    assignees: (json.assignees ?? []).map((user) => user.login),
  };
}

export const update = (id, { title, body }, cfg) => ({ method: 'PATCH', url: issueApi(cfg, id), body: { title, body } });

export const comment = (id, markdown, cfg) => ({
  method: 'POST',
  url: `${issueApi(cfg, id)}/comments`,
  body: { body: markdown },
});

// GitHub sub-issues: the child is added by its internal id, not its number.
export const link = (parentId, _childId, childInternalId, cfg) => ({
  method: 'POST',
  url: `${issueApi(cfg, parentId)}/sub_issues`,
  body: { sub_issue_id: childInternalId },
});
