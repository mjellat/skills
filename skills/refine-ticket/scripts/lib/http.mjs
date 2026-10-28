// One JSON request with a timeout, no redirects, and secrets scrubbed from
// every error message. Returns { status, json }; json is null for empty bodies
// (Jira answers a successful update with 204).

const UNCERTAIN = 'It may or may not have gone through; read the ticket again before retrying.';

function redact(text, secrets) {
  let result = text;
  for (const secret of Object.values(secrets)) {
    if (secret && secret.length >= 4) result = result.split(secret).join('***');
  }
  return result;
}

// retrySafe: false for requests that are not idempotent (posting a comment),
// so a lost answer is reported as "may or may not have gone through".
export async function request({
  method,
  url,
  headers = {},
  body,
  secrets = {},
  fetchImpl = globalThis.fetch,
  timeoutMs = 30_000,
  retrySafe = true,
}) {
  const host = new URL(url).host;
  let response;
  try {
    response = await fetchImpl(url, {
      method,
      // A redirect would re-send the request (and credentials) somewhere unexpected.
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'refine-ticket-skill',
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    const reason = err.cause?.message ?? err.message;
    throw new Error(redact(`Request to ${host} failed: ${reason}.${retrySafe ? '' : ` ${UNCERTAIN}`}`, secrets));
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(redact(`${host} responded with HTTP ${response.status}: ${text.slice(0, 500)}`, secrets));
  }
  if (!text.trim()) return { status: response.status, json: null };
  try {
    return { status: response.status, json: JSON.parse(text) };
  } catch {
    throw new Error(`${host} answered HTTP ${response.status} but not with JSON.${retrySafe ? '' : ` ${UNCERTAIN}`}`);
  }
}
