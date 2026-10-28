// REST API v2, like create-ticket: works on Cloud and Data Center. Descriptions
// come back as Jira wiki markup and go out converted from Markdown.

import { CONNECTIONS } from '../shared/connection.mjs';
import { markdownToJira } from '../shared/markdown-to-jira.mjs';

const KEY = /^[A-Za-z][A-Za-z0-9_]+-\d+$/;
const issueApi = (cfg, key) => `${CONNECTIONS.jira.base(cfg)}/rest/api/2/issue/${key}`;

// Accepts a key (ABC-12) or a /browse/ URL on the configured site.
export function parseRef(ref, cfg) {
  const text = String(ref).trim();
  if (KEY.test(text)) return text.toUpperCase();

  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`Cannot read "${ref}" as a Jira issue key (like ABC-12) or URL`);
  }
  const match = /\/browse\/([A-Za-z][A-Za-z0-9_]+-\d+)\/?$/.exec(url.pathname);
  if (!match || url.host !== new URL(CONNECTIONS.jira.base(cfg)).host) {
    throw new Error(`"${ref}" is not an issue URL on ${new URL(CONNECTIONS.jira.base(cfg)).host}`);
  }
  return match[1].toUpperCase();
}

export const get = (key, cfg) => ({
  method: 'GET',
  url: `${issueApi(cfg, key)}?fields=summary,description,status,labels,issuetype,assignee`,
});

export function normalize(json, cfg) {
  const fields = json.fields ?? {};
  return {
    id: json.key,
    url: `${CONNECTIONS.jira.base(cfg)}/browse/${json.key}`,
    title: fields.summary,
    body: fields.description ?? '',
    format: 'jira-wiki',
    state: fields.status?.name ?? null,
    type: fields.issuetype?.name ?? null,
    labels: fields.labels ?? [],
    assignees: fields.assignee?.displayName ? [fields.assignee.displayName] : [],
  };
}

export const update = (key, { title, body }, cfg) => ({
  method: 'PUT',
  url: issueApi(cfg, key),
  body: { fields: { summary: title, description: markdownToJira(body) } },
});

export const comment = (key, markdown, cfg) => ({
  method: 'POST',
  url: `${issueApi(cfg, key)}/comment`,
  body: { body: markdownToJira(markdown) },
});
