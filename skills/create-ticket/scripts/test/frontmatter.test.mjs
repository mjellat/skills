import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter } from '../lib/frontmatter.mjs';

test('returns the text untouched when there is no frontmatter', () => {
  const { data, body } = parseFrontmatter('# Title\n\nBody');
  assert.deepEqual(data, {});
  assert.equal(body, '# Title\n\nBody');
});

test('parses flat keys, quoted values and inline lists', () => {
  const { data, body } = parseFrontmatter(
    ['---', 'name: bug', 'description: "Report a defect: the usual"', "type: 'Bug'", 'labels: [bug, needs triage]', '---', '# T'].join('\n'),
  );
  assert.deepEqual(data, {
    name: 'bug',
    description: 'Report a defect: the usual',
    type: 'Bug',
    labels: ['bug', 'needs triage'],
  });
  assert.equal(body, '# T');
});

test('handles CRLF line endings, comments and empty lists', () => {
  const { data } = parseFrontmatter('---\r\n# note\r\nlabels: []\r\nname: x\r\n---\r\nbody');
  assert.deepEqual(data, { labels: [], name: 'x' });
});

test('accepts an empty frontmatter block', () => {
  const { data, body } = parseFrontmatter('---\n---\nbody');
  assert.deepEqual(data, {});
  assert.equal(body, 'body');
});

test('rejects a line without a colon', () => {
  assert.throws(() => parseFrontmatter('---\nnot a pair\n---\nbody'), /Invalid frontmatter line/);
});
