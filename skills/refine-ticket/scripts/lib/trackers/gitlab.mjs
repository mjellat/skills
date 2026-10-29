import { CONNECTIONS } from '../shared/connection.mjs';

const issueApi = (cfg, id) =>
  `${CONNECTIONS.gitlab.base(cfg)}/api/v4/projects/${encodeURIComponent(String(cfg.project))}/issues/${id}`;

// Accepts 12, #12 or an issue URL of the configured project.
export function parseRef(ref, cfg) {
  const text = String(ref).trim();
  const number = /^#?(\d+)$/.exec(text);
  if (number) return number[1];

  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`Cannot read "${ref}" as a GitLab issue number or URL`);
  }
  const match = /^\/(.+?)\/-\/issues\/(\d+)\/?$/.exec(url.pathname);
  if (!match || url.host !== new URL(CONNECTIONS.gitlab.base(cfg)).host) {
    throw new Error(`"${ref}" is not an issue URL on ${new URL(CONNECTIONS.gitlab.base(cfg)).host}`);
  }
  // A numeric project id can't be compared with the path in the URL.
  const configured = String(cfg.project);
  if (configured.includes('/') && match[1].toLowerCase() !== configured.toLowerCase()) {
    throw new Error(`"${ref}" is in ${match[1]}, but the configured project is ${configured}`);
  }
  return match[2];
}

export const get = (id, cfg) => ({ method: 'GET', url: issueApi(cfg, id) });

export function normalize(json) {
  return {
    id: `#${json.iid}`,
    url: json.web_url,
    title: json.title,
    body: json.description ?? '',
    format: 'markdown',
    state: json.state,
    type: json.issue_type ?? null,
    labels: (json.labels ?? []).map((label) => (typeof label === 'string' ? label : label.name)),
    assignees: (json.assignees ?? []).map((user) => user.username),
  };
}

export const update = (id, { title, body }, cfg) => ({
  method: 'PUT',
  url: issueApi(cfg, id),
  body: { title, description: body },
});

export const comment = (id, markdown, cfg) => ({
  method: 'POST',
  url: `${issueApi(cfg, id)}/notes`,
  body: { body: markdown },
});

// "relates_to" works in every tier; GitLab has no parent link for plain issues there.
export const link = (parentId, childId, _childInternalId, cfg) => ({
  method: 'POST',
  url: `${issueApi(cfg, parentId)}/links`,
  body: { target_project_id: String(cfg.project), target_issue_iid: Number(childId), link_type: 'relates_to' },
});
