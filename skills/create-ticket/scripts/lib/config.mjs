// Resolves configuration and templates. Lookup order is always
// project (.tickets/, found by walking up from cwd) -> global -> bundled.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from './frontmatter.mjs';

export const BUNDLED_TEMPLATES = fileURLToPath(new URL('../../templates/', import.meta.url));

function isDir(path) {
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

export function templateDirs(opts = {}) {
  const dirs = [];
  const projectDir = findProjectDir(opts.cwd);
  if (projectDir) dirs.push({ source: 'project', dir: join(projectDir, 'templates') });
  dirs.push({ source: 'global', dir: join(globalDir(opts), 'templates') });
  dirs.push({ source: 'bundled', dir: opts.bundledDir ?? BUNDLED_TEMPLATES });
  return dirs;
}

// A template in a higher-priority location shadows one with the same name below it.
export function listTemplates(opts = {}) {
  const found = new Map();
  for (const { source, dir } of templateDirs(opts)) {
    if (!isDir(dir)) continue;
    for (const file of readdirSync(dir).sort()) {
      if (!file.endsWith('.md')) continue;
      const name = file.slice(0, -'.md'.length);
      if (found.has(name)) continue;
      const path = join(dir, file);
      const { data } = parseFrontmatter(readFileSync(path, 'utf8'));
      found.set(name, { name, description: data.description ?? '', source, path });
    }
  }
  return [...found.values()];
}

export function loadTemplate(name, opts = {}) {
  const templates = listTemplates(opts);
  const template = templates.find((t) => t.name === name);
  if (!template) {
    const available = templates.map((t) => t.name).join(', ') || 'none';
    throw new Error(`Unknown template "${name}". Available: ${available}`);
  }
  return { ...template, content: readFileSync(template.path, 'utf8') };
}
