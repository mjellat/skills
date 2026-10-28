import { checkUrl, trimSlash } from './util.mjs';

const DEFAULT_BASE_URL = 'https://gitlab.com';

export function validate(cfg) {
  const problems = [];
  if (cfg.project === undefined || cfg.project === '') {
    problems.push('gitlab.project is required (path like "group/project" or a numeric id)');
  }
  problems.push(...checkUrl('gitlab.baseUrl', cfg.baseUrl ?? DEFAULT_BASE_URL));
  return problems;
}

export function envVars(cfg) {
  return { token: [cfg.tokenEnv ?? 'GITLAB_TOKEN'] };
}

export function buildRequest(ticket, cfg) {
  const body = { title: ticket.title, description: ticket.body };
  if (ticket.labels.length) body.labels = ticket.labels.join(',');

  const warnings = [];
  if (ticket.assignees.length) {
    warnings.push('assignees were ignored: the GitLab API needs numeric user ids, not usernames');
  }
  return {
    url: `${trimSlash(cfg.baseUrl ?? DEFAULT_BASE_URL)}/api/v4/projects/${encodeURIComponent(String(cfg.project))}/issues`,
    body,
    warnings,
  };
}

export function headers({ token }) {
  return { 'PRIVATE-TOKEN': token };
}

export const extractUrl = (json) => json.web_url;
export const extractId = (json) => `#${json.iid}`;
