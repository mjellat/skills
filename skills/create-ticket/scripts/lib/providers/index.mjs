import { CONNECTIONS, resolveSecrets, validateConfig } from '../shared/connection.mjs';
import * as github from './github.mjs';
import * as gitlab from './gitlab.mjs';
import * as jira from './jira.mjs';

export { resolveSecrets, validateConfig };

// Request building and response parsing per tracker. Config validation,
// credentials and auth headers are shared and live in shared/connection.mjs.
export const PROVIDERS = { github, gitlab, jira };

// Pure and secret-free, so it is safe to print for --dry-run.
export function buildRequest(config, ticket) {
  const request = PROVIDERS[config.provider].buildRequest(ticket, config[config.provider]);
  return { provider: config.provider, method: 'POST', ...request };
}

function redact(text, values) {
  let result = text;
  for (const secret of Object.values(values)) {
    if (secret && secret.length >= 4) result = result.split(secret).join('***');
  }
  return result;
}

const MAY_EXIST = 'The ticket may or may not have been created; check the tracker before retrying.';

export async function submit(config, ticket, { env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 30_000 } = {}) {
  const problems = validateConfig(config);
  if (problems.length) throw new Error(`Invalid configuration: ${problems.join('; ')}`);

  const { values, missing } = resolveSecrets(config, env);
  if (missing.length) throw new Error(`Missing environment variable: ${missing.join(', ')}`);

  const mod = PROVIDERS[config.provider];
  const cfg = config[config.provider];
  const request = buildRequest(config, ticket);
  const host = new URL(request.url).host;

  let response;
  try {
    response = await fetchImpl(request.url, {
      method: request.method,
      // A redirect would re-send a POST (and credentials) somewhere unexpected.
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'create-ticket-skill',
        ...CONNECTIONS[config.provider].headers(values, cfg),
      },
      body: JSON.stringify(request.body),
    });
  } catch (err) {
    const reason = err.cause?.message ?? err.message;
    throw new Error(redact(`Request to ${host} failed: ${reason}. ${MAY_EXIST}`, values));
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(redact(`${host} responded with HTTP ${response.status}: ${text.slice(0, 500)}`, values));
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${host} answered HTTP ${response.status} but not with JSON. ${MAY_EXIST}`);
  }
  const url = mod.extractUrl(json, cfg);
  if (!url) throw new Error(`${host} answered HTTP ${response.status} without a ticket URL. ${MAY_EXIST}`);

  return { provider: config.provider, id: mod.extractId(json), url, warnings: request.warnings };
}
