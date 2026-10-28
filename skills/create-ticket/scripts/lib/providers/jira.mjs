// Uses REST API v2: it works on Jira Cloud and Data Center and takes the
// description as a plain string (wiki markup), whereas v3 requires ADF JSON.

import { markdownToJira } from '../markdown-to-jira.mjs';
import { checkUrl, trimSlash } from './util.mjs';

const MAX_SUMMARY = 255;

export function validate(cfg) {
  const problems = [];
  if (!cfg.baseUrl) problems.push('jira.baseUrl is required (e.g. https://acme.atlassian.net)');
  else problems.push(...checkUrl('jira.baseUrl', cfg.baseUrl));
  if (!/^[A-Za-z][A-Za-z0-9_]+$/.test(cfg.projectKey ?? '')) problems.push('jira.projectKey must be a project key like "ABC"');
  if (cfg.auth !== undefined && !['basic', 'bearer'].includes(cfg.auth)) problems.push('jira.auth must be "basic" or "bearer"');
  return problems;
}

export function envVars(cfg) {
  const token = [cfg.tokenEnv ?? 'JIRA_API_TOKEN'];
  if (cfg.auth === 'bearer') return { token };
  return { email: [cfg.emailEnv ?? 'JIRA_EMAIL'], token };
}

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
  return { url: `${trimSlash(cfg.baseUrl)}/rest/api/2/issue`, body: { fields }, warnings };
}

export function headers({ token, email }, cfg) {
  if (cfg.auth === 'bearer') return { Authorization: `Bearer ${token}` };
  return { Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}` };
}

export const extractUrl = (json, cfg) => (json.key ? `${trimSlash(cfg.baseUrl)}/browse/${json.key}` : undefined);
export const extractId = (json) => json.key;
