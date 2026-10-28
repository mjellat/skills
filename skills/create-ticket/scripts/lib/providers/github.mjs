import { checkUrl, trimSlash } from './util.mjs';

const DEFAULT_API_URL = 'https://api.github.com';

export function validate(cfg) {
  const problems = [];
  if (!/^[\w.-]+\/[\w.-]+$/.test(cfg.repo ?? '')) problems.push('github.repo must look like "owner/name"');
  problems.push(...checkUrl('github.apiUrl', cfg.apiUrl ?? DEFAULT_API_URL));
  return problems;
}

// Env var names to look up, per secret kind. The first one that is set wins.
export function envVars(cfg) {
  return { token: cfg.tokenEnv ? [cfg.tokenEnv] : ['GITHUB_TOKEN', 'GH_TOKEN'] };
}

export function buildRequest(ticket, cfg) {
  const body = { title: ticket.title, body: ticket.body };
  if (ticket.labels.length) body.labels = ticket.labels;
  if (ticket.assignees.length) body.assignees = ticket.assignees;
  return {
    url: `${trimSlash(cfg.apiUrl ?? DEFAULT_API_URL)}/repos/${cfg.repo}/issues`,
    body,
    warnings: [],
  };
}

export function headers({ token }) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

export const extractUrl = (json) => json.html_url;
export const extractId = (json) => `#${json.number}`;
