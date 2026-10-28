import { CONNECTIONS } from '../shared/connection.mjs';

export function buildRequest(ticket, cfg) {
  const body = { title: ticket.title, body: ticket.body };
  if (ticket.labels.length) body.labels = ticket.labels;
  if (ticket.assignees.length) body.assignees = ticket.assignees;
  return { url: `${CONNECTIONS.github.base(cfg)}/repos/${cfg.repo}/issues`, body, warnings: [] };
}

export const extractUrl = (json) => json.html_url;
export const extractId = (json) => `#${json.number}`;
