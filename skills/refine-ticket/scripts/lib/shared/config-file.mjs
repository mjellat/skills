// Copy of shared/lib/config-file.mjs. Edit the original and run "node scripts/sync-shared.mjs".
// Locates and loads .tickets/config.json (project) or the global config.
// Shared by create-ticket and refine-ticket so both read the same file.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export function isDir(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function globalDir({ env = process.env, home = homedir() } = {}) {
  if (env.TICKET_SKILL_HOME) return env.TICKET_SKILL_HOME;
  return join(env.XDG_CONFIG_HOME || join(home, '.config'), 'ticket-skill');
}

export function findProjectDir(cwd = process.cwd()) {
  let dir = resolve(cwd);
  for (;;) {
    const candidate = join(dir, '.tickets');
    if (isDir(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// Returns { config, scope, path } or null when no config file exists.
// The first file found wins; project and global configs are not merged.
export function loadConfig(opts = {}) {
  const projectDir = findProjectDir(opts.cwd);
  const candidates = [
    projectDir && { scope: 'project', path: join(projectDir, 'config.json') },
    { scope: 'global', path: join(globalDir(opts), 'config.json') },
  ].filter(Boolean);

  for (const { scope, path } of candidates) {
    if (!existsSync(path)) continue;
    let config;
    try {
      config = JSON.parse(readFileSync(path, 'utf8'));
    } catch (err) {
      throw new Error(`Cannot parse ${path}: ${err.message}`);
    }
    return { config, scope, path };
  }
  return null;
}
