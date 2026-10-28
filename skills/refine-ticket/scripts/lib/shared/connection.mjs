// Copy of shared/lib/connection.mjs. Edit the original and run "node scripts/sync-shared.mjs".
// How to reach each tracker: config validation, which environment variables
// hold the credentials, and the auth headers. Shared by create-ticket and
// refine-ticket so a config that works for one works for the other.

import { checkUrl, trimSlash } from './url.mjs';

const GITHUB_API = 'https://api.github.com';
const GITLAB_URL = 'https://gitlab.com';

export const CONNECTIONS = {
  github: {
    base: (cfg) => trimSlash(cfg.apiUrl ?? GITHUB_API),
    validate(cfg) {
      const problems = [];
      if (!/^[\w.-]+\/[\w.-]+$/.test(cfg.repo ?? '')) problems.push('github.repo must look like "owner/name"');
      problems.push(...checkUrl('github.apiUrl', cfg.apiUrl ?? GITHUB_API));
      return problems;
    },
    // Env var names to look up, per secret kind. The first one that is set wins.
    envVars: (cfg) => ({ token: cfg.tokenEnv ? [cfg.tokenEnv] : ['GITHUB_TOKEN', 'GH_TOKEN'] }),
    headers: ({ token }) => ({
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    }),
  },

  gitlab: {
    base: (cfg) => trimSlash(cfg.baseUrl ?? GITLAB_URL),
    validate(cfg) {
      const problems = [];
      if (cfg.project === undefined || cfg.project === '') {
        problems.push('gitlab.project is required (path like "group/project" or a numeric id)');
      }
      problems.push(...checkUrl('gitlab.baseUrl', cfg.baseUrl ?? GITLAB_URL));
      return problems;
    },
    envVars: (cfg) => ({ token: [cfg.tokenEnv ?? 'GITLAB_TOKEN'] }),
    headers: ({ token }) => ({ 'PRIVATE-TOKEN': token }),
  },

  jira: {
    base: (cfg) => trimSlash(cfg.baseUrl),
    validate(cfg) {
      const problems = [];
      if (!cfg.baseUrl) problems.push('jira.baseUrl is required (e.g. https://acme.atlassian.net)');
      else problems.push(...checkUrl('jira.baseUrl', cfg.baseUrl));
      if (!/^[A-Za-z][A-Za-z0-9_]+$/.test(cfg.projectKey ?? '')) problems.push('jira.projectKey must be a project key like "ABC"');
      if (cfg.auth !== undefined && !['basic', 'bearer'].includes(cfg.auth)) {
        problems.push('jira.auth must be "basic" or "bearer"');
      }
      return problems;
    },
    envVars(cfg) {
      const token = [cfg.tokenEnv ?? 'JIRA_API_TOKEN'];
      if (cfg.auth === 'bearer') return { token };
      return { email: [cfg.emailEnv ?? 'JIRA_EMAIL'], token };
    },
    headers({ token, email }, cfg) {
      if (cfg.auth === 'bearer') return { Authorization: `Bearer ${token}` };
      return { Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}` };
    },
  },
};

export function validateConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return ['config must be a JSON object'];
  const names = Object.keys(CONNECTIONS);
  if (!names.includes(config.provider)) return [`provider must be one of: ${names.join(', ')}`];
  const block = config[config.provider];
  if (!block || typeof block !== 'object' || Array.isArray(block)) {
    return [`missing "${config.provider}" settings block`];
  }
  return CONNECTIONS[config.provider].validate(block);
}

// Looks up the provider's env vars. `missing` lists the names that were not set;
// secret values only ever live in `values` and are never printed by the CLIs.
export function resolveSecrets(config, env = process.env) {
  const wanted = CONNECTIONS[config.provider].envVars(config[config.provider]);
  const values = {};
  const missing = [];
  const status = {};
  for (const [kind, names] of Object.entries(wanted)) {
    const hit = names.find((name) => env[name]);
    status[kind] = { names, set: Boolean(hit) };
    if (hit) values[kind] = env[hit];
    else missing.push(names.join(' or '));
  }
  return { values, missing, status };
}
