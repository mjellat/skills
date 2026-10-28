import { CONNECTIONS } from '../shared/connection.mjs';

export function buildRequest(ticket, cfg) {
  const body = { title: ticket.title, description: ticket.body };
  if (ticket.labels.length) body.labels = ticket.labels.join(',');

  const warnings = [];
  if (ticket.assignees.length) {
    warnings.push('assignees were ignored: the GitLab API needs numeric user ids, not usernames');
  }
  return {
    url: `${CONNECTIONS.gitlab.base(cfg)}/api/v4/projects/${encodeURIComponent(String(cfg.project))}/issues`,
    body,
    warnings,
  };
}

export const extractUrl = (json) => json.web_url;
export const extractId = (json) => `#${json.iid}`;
