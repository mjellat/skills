// Uses REST API v2: it works on Jira Cloud and Data Center and takes the
// description as a plain string (wiki markup), whereas v3 requires ADF JSON.

import { CONNECTIONS } from '../shared/connection.mjs';
import { markdownToJira } from '../shared/markdown-to-jira.mjs';

const MAX_SUMMARY = 255;

export function buildRequest(ticket, cfg) {
  if (ticket.title.length > MAX_SUMMARY) {
    throw new Error(`Title is ${ticket.title.length} characters; Jira allows at most ${MAX_SUMMARY}`);
  }
  const fields = {
    project: { key: cfg.projectKey },
    summary: ticket.title,
    description: markdownToJira(ticket.body),
    issuetype: { name: ticket.type ?? cfg.defaultIssueType ?? 'Task' },
  };
  if (ticket.labels.length) fields.labels = ticket.labels.map((label) => label.replace(/\s+/g, '-'));

  const warnings = [];
  if (ticket.assignees.length) {
    warnings.push('assignees were ignored: Jira needs account ids, not usernames');
  }
  return { url: `${CONNECTIONS.jira.base(cfg)}/rest/api/2/issue`, body: { fields }, warnings };
}

export const extractUrl = (json, cfg) => (json.key ? `${CONNECTIONS.jira.base(cfg)}/browse/${json.key}` : undefined);
export const extractId = (json) => json.key;
