import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findProjectDir, globalDir, listTemplates, loadConfig, loadTemplate } from '../lib/config.mjs';

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), 'create-ticket-'));
  const home = join(root, 'home');
  const project = join(root, 'project');
  const bundled = join(root, 'bundled');
  for (const dir of [home, project, bundled]) mkdirSync(dir, { recursive: true });
  return { root, home, project, bundled, opts: { cwd: project, env: {}, home, bundledDir: bundled } };
}

function write(path, content) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

test('globalDir honours TICKET_SKILL_HOME, then XDG_CONFIG_HOME, then ~/.config', () => {
  assert.equal(globalDir({ env: { TICKET_SKILL_HOME: '/a' }, home: '/h' }), '/a');
  assert.equal(globalDir({ env: { XDG_CONFIG_HOME: '/x' }, home: '/h' }), '/x/ticket-skill');
  assert.equal(globalDir({ env: {}, home: '/h' }), '/h/.config/ticket-skill');
});

test('findProjectDir walks up from a subdirectory', () => {
  const { project } = sandbox();
  mkdirSync(join(project, '.tickets'));
  mkdirSync(join(project, 'src', 'deep'), { recursive: true });
  assert.equal(findProjectDir(join(project, 'src', 'deep')), join(project, '.tickets'));
});

test('loadConfig returns null when nothing is configured', () => {
  const { opts } = sandbox();
  assert.equal(loadConfig(opts), null);
});

test('loadConfig prefers the project config over the global one', () => {
  const { opts, project, home } = sandbox();
  write(join(home, '.config', 'ticket-skill', 'config.json'), '{"provider":"gitlab"}');
  assert.equal(loadConfig(opts).scope, 'global');

  write(join(project, '.tickets', 'config.json'), '{"provider":"github"}');
  const result = loadConfig(opts);
  assert.equal(result.scope, 'project');
  assert.equal(result.config.provider, 'github');
});

test('loadConfig names the file when the JSON is broken', () => {
  const { opts, project } = sandbox();
  write(join(project, '.tickets', 'config.json'), '{ nope');
  assert.throws(() => loadConfig(opts), /Cannot parse .*config\.json/);
});

test('templates resolve project -> global -> bundled and shadow by name', () => {
  const { opts, project, home, bundled } = sandbox();
  write(join(bundled, 'bug.md'), '---\ndescription: bundled bug\n---\n# b');
  write(join(bundled, 'task.md'), '---\ndescription: bundled task\n---\n# t');
  write(join(home, '.config', 'ticket-skill', 'templates', 'task.md'), '---\ndescription: global task\n---\n# t');
  write(join(project, '.tickets', 'templates', 'bug.md'), '---\ndescription: project bug\n---\n# b');
  write(join(project, '.tickets', 'templates', 'notes.txt'), 'ignored');

  const byName = Object.fromEntries(listTemplates(opts).map((t) => [t.name, t]));
  assert.deepEqual(Object.keys(byName).sort(), ['bug', 'task']);
  assert.equal(byName.bug.source, 'project');
  assert.equal(byName.task.source, 'global');
  assert.equal(byName.task.description, 'global task');
});

test('loadTemplate returns the content and lists alternatives on a miss', () => {
  const { opts, bundled } = sandbox();
  write(join(bundled, 'bug.md'), '# bug body');
  assert.equal(loadTemplate('bug', opts).content, '# bug body');
  assert.throws(() => loadTemplate('nope', opts), /Unknown template "nope"\. Available: bug/);
});
