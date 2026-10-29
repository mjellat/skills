// Finds a project's Architecture Decision Records and reads what a caller
// needs: which ADRs exist, their status, which fit the topic, and what number
// and file name a new one should get. The ADR text itself is read by the agent.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

function isDir(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

const DEFAULT_DIR = 'docs/adr';
const CANDIDATE_DIRS = [
  'docs/adr',
  'doc/adr',
  'docs/adrs',
  'docs/decisions',
  'docs/architecture/decisions',
  'doc/architecture/decisions',
  'architecture/decisions',
  'adr',
  'adrs',
  'decisions',
];
// 0007-title.md, 7-title.md, adr-0007-title.md
const ADR_FILE = /^(?:adr[-_])?(\d{1,5})[-_](.+)\.md$/i;

export function findRepoRoot(cwd = process.cwd()) {
  let dir = resolve(cwd);
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(cwd);
    dir = parent;
  }
}

const inside = (root, dir) => dir === root || dir.startsWith(root + sep);

// Order: the adr-tools marker file, then the usual directory names, preferring
// one that already holds ADRs. The working directory is tried before the root
// so a sub-project can keep its own records.
export function findAdrDir(cwd = process.cwd()) {
  const root = findRepoRoot(cwd);

  const marker = join(root, '.adr-dir');
  if (existsSync(marker)) {
    const dir = resolve(root, readFileSync(marker, 'utf8').trim());
    if (inside(root, dir) && isDir(dir)) return { dir, source: '.adr-dir' };
  }

  const bases = [...new Set([resolve(cwd), root])];
  const existing = bases.flatMap((base) => CANDIDATE_DIRS.map((rel) => join(base, rel))).filter(isDir);
  const populated = existing.find((dir) => readdirSync(dir).some((file) => ADR_FILE.test(file)));
  const dir = populated ?? existing[0];
  return dir ? { dir, source: 'convention' } : null;
}

export function slugify(title) {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return slug || 'decision';
}

function readStatus(text) {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const fromFront = front && /^status:\s*["']?(.+?)["']?\s*$/im.exec(front[1]);
  const raw =
    fromFront?.[1] ??
    /^##\s+Status\s*\r?\n+\s*([^\s#][^\r\n]*)/im.exec(text)?.[1] ??
    /^[ \t]*[*_-]*[ \t]*\**Status\**[ \t]*:\**[ \t]*(.+)$/im.exec(text)?.[1];
  return raw ? raw.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\*+/g, '').trim() : null;
}

function readDate(text) {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const fromFront = front && /^date:\s*["']?(.+?)["']?\s*$/im.exec(front[1]);
  const raw = fromFront?.[1] ?? /^[ \t]*[*_-]*[ \t]*\**Date\**[ \t]*:\**[ \t]*(.+)$/im.exec(text)?.[1];
  return raw ? raw.replace(/\*+/g, '').trim() : null;
}

function detectFormat(text) {
  if (/^##\s+Context and Problem Statement/im.test(text)) return 'madr';
  if (/^##\s+Context\b/im.test(text) && /^##\s+Decision\b/im.test(text)) return 'nygard';
  return 'unknown';
}

function parseAdr(dir, name, root) {
  const text = readFileSync(join(dir, name), 'utf8');
  const [, number, slug] = ADR_FILE.exec(name);
  const heading = /^#\s+(.+?)\s*$/m.exec(text)?.[1] ?? slug.replace(/[-_]/g, ' ');
  const title = heading
    .replace(/^ADR[-\s]?\d+\s*[:.\-–]\s*/i, '')
    .replace(/^\d+\.\s+/, '')
    .trim();
  const status = readStatus(text);
  const supersededBy = status && /supersed\w*\s+by\s+(?:ADR[-\s]?)?0*(\d+)/i.exec(status)?.[1];

  return {
    number,
    title,
    status,
    date: readDate(text),
    supersededBy: supersededBy ?? null,
    path: relative(root, join(dir, name)).split(sep).join('/'),
    format: detectFormat(text),
    text: text.toLowerCase(),
  };
}

function git(root, args) {
  try {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim();
  } catch {
    return null;
  }
}

// Browse URL base of the origin remote for GitHub and GitLab hosts. Only host
// and path are used, so credentials embedded in the remote URL never leak.
export function remoteBase(root) {
  const raw = git(root, ['remote', 'get-url', 'origin']);
  if (!raw) return null;

  let host;
  let path;
  const scp = /^[\w.-]+@([^:/]+):(?!\d+\/)(.+)$/.exec(raw);
  if (scp) {
    [, host, path] = scp;
  } else {
    try {
      const url = new URL(raw);
      host = url.protocol.startsWith('http') ? url.host : url.hostname;
      path = url.pathname;
    } catch {
      return null;
    }
  }
  path = path.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '');
  const kind = host === 'github.com' ? 'github' : host.includes('gitlab') ? 'gitlab' : null;
  return kind && path ? { kind, base: `https://${host}/${path}` } : null;
}

function defaultBranch(root) {
  return git(root, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])?.replace(/^origin\//, '') || 'main';
}

function score(adr, terms) {
  const inTitle = terms.reduce((n, term) => n + (adr.title.toLowerCase().includes(term) ? 1 : 0), 0);
  const inText = terms.reduce((n, term) => n + (adr.text.split(term).length - 1), 0);
  return inTitle * 3 + inText;
}

// match: search terms; keeps ADRs that mention one of them, best first.
// title: a proposed title; adds the file name and path a new ADR should get.
export function scanAdrs({ cwd = process.cwd(), match = [], title } = {}) {
  const located = findAdrDir(cwd);
  if (!located) {
    return {
      found: false,
      suggestedDir: DEFAULT_DIR,
      hint: `No ADR directory found. Ask before creating one; ${DEFAULT_DIR}/ is the usual choice.`,
    };
  }

  const root = findRepoRoot(cwd);
  const files = readdirSync(located.dir).filter((name) => ADR_FILE.test(name)).sort();
  let adrs = files.map((name) => parseAdr(located.dir, name, root));

  const formats = adrs.map((adr) => adr.format).filter((format) => format !== 'unknown');
  const format = ['madr', 'nygard'].sort((a, b) => formats.filter((f) => f === b).length - formats.filter((f) => f === a).length)[0];

  const width = adrs.length ? Math.max(...adrs.map((adr) => adr.number.length)) : 4;
  const nextNumber = String(Math.max(0, ...adrs.map((adr) => Number(adr.number))) + 1).padStart(width, '0');
  const prefix = files.some((name) => /^adr[-_]/i.test(name)) ? 'adr-' : '';

  const remote = remoteBase(root);
  const branch = remote ? defaultBranch(root) : null;
  const blob = remote?.kind === 'gitlab' ? '-/blob' : 'blob';

  const terms = match.map((term) => term.trim().toLowerCase()).filter(Boolean);
  adrs = adrs.map((adr) => ({ ...adr, score: terms.length ? score(adr, terms) : undefined }));
  if (terms.length) adrs = adrs.filter((adr) => adr.score > 0).sort((a, b) => b.score - a.score);

  const result = {
    found: true,
    dir: relative(root, located.dir).split(sep).join('/') || '.',
    source: located.source,
    format: formats.length ? format : 'unknown',
    total: files.length,
    nextNumber,
    adrs: adrs.map(({ text, format: _format, ...adr }) => ({
      ...adr,
      url: remote ? `${remote.base}/${blob}/${branch}/${adr.path}` : null,
    })),
  };
  if (title) {
    const fileName = `${prefix}${nextNumber}-${slugify(title)}.md`;
    result.next = { fileName, path: `${result.dir}/${fileName}` };
  }
  return result;
}
