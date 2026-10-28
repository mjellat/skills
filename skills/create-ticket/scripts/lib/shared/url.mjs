// Copy of shared/lib/url.mjs. Edit the original and run "node scripts/sync-shared.mjs".
export function trimSlash(url) {
  return url.replace(/\/+$/, '');
}

// Tokens travel in request headers, so refuse plain http except for local testing.
export function checkUrl(label, value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return [`${label} is not a valid URL`];
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol === 'https:' || (url.protocol === 'http:' && local)) return [];
  return [`${label} must use https (http is only allowed for localhost)`];
}
