// Template lookup: project (.tickets/templates, found by walking up from cwd)
// -> global -> bundled. Finding the config file itself lives in shared/.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findProjectDir, globalDir, isDir, loadConfig } from './shared/config-file.mjs';
import { parseFrontmatter } from './shared/frontmatter.mjs';

export { findProjectDir, globalDir, loadConfig };

export const BUNDLED_TEMPLATES = fileURLToPath(new URL('../../templates/', import.meta.url));

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
