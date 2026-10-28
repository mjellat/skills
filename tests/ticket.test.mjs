import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTicket } from '../shared/lib/ticket.mjs';

test('extracts title, body and frontmatter fields', () => {
  const ticket = parseTicket(
    ['---', 'name: bug', 'type: Bug', 'labels: [bug, p1]', 'assignees: octocat', '---', '# Login fails', '', '## Summary', 'It breaks.'].join('\n'),
  );
  assert.deepEqual(ticket, {
    title: 'Login fails',
    body: '## Summary\nIt breaks.',
    labels: ['bug', 'p1'],
    assignees: ['octocat'],
    type: 'Bug',
  });
});

test('strips template hint comments, including multi-line ones', () => {
  const ticket = parseTicket('# T\n\n<!-- fill in\nthe summary -->\n## Summary\nText <!-- inline -->here');
  assert.equal(ticket.body, '## Summary\nText here');
});

test('applies titlePrefix once', () => {
  assert.equal(parseTicket('---\ntitlePrefix: "[Bug] "\n---\n# Crash\nbody').title, '[Bug] Crash');
  assert.equal(parseTicket('---\ntitlePrefix: "[Bug] "\n---\n# [Bug] Crash\nbody').title, '[Bug] Crash');
});

test('ignores "# " lines inside code fences when looking for the title', () => {
  const ticket = parseTicket('```sh\n# not a title\n```\n\n# Real title\nbody');
  assert.equal(ticket.title, 'Real title');
  assert.match(ticket.body, /# not a title/);
});

test('rejects a draft without title or without body', () => {
  assert.throws(() => parseTicket('just text'), /needs a title/);
  assert.throws(() => parseTicket('# Only a title\n<!-- nothing -->'), /body is empty/);
});

test('defaults optional fields', () => {
  const ticket = parseTicket('# T\nbody');
  assert.deepEqual([ticket.labels, ticket.assignees, ticket.type], [[], [], null]);
});
