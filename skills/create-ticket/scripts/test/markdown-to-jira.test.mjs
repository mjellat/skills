import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markdownToJira } from '../lib/markdown-to-jira.mjs';

const convert = (...lines) => markdownToJira(lines.join('\n'));

test('headings keep their level and trailing characters', () => {
  assert.equal(convert('# A', '### Support C#'), 'h1. A\nh3. Support C#');
});

test('inline emphasis, code and links', () => {
  assert.equal(
    convert('**bold** and *italic* and ~~gone~~ and `code` and [docs](https://x.test/a)'),
    '*bold* and _italic_ and -gone- and {{code}} and [docs|https://x.test/a]',
  );
});

test('math-like asterisks and snake_case are left alone', () => {
  assert.equal(convert('2 * 3 * 4 and some_snake_case'), '2 * 3 * 4 and some_snake_case');
});

test('code inside backticks is not formatted, braces are escaped', () => {
  assert.equal(convert('use `**raw** {x}` here'), 'use {{**raw** \\{x\\}}} here');
});

test('braces and brackets in plain text are escaped so they are not read as macros or links', () => {
  assert.equal(convert('see {noformat} and [WIP]'), 'see \\{noformat\\} and \\[WIP]');
});

test('link labels may contain code', () => {
  assert.equal(convert('[`foo()`](https://x.test)'), '[{{foo()}}|https://x.test]');
});

test('fenced code blocks pass through verbatim with their language', () => {
  assert.equal(
    convert('```js', 'const a = **b**; // # not a heading', '```', 'after'),
    '{code:js}\nconst a = **b**; // # not a heading\n{code}\nafter',
  );
  assert.equal(convert('```', 'x', '```'), '{code}\nx\n{code}');
});

test('nested and mixed lists, task items', () => {
  assert.equal(
    convert('- a', '  - b', '1. one', '   - sub', '- [ ] todo', '- [x] done'),
    '* a\n** b\n# one\n#* sub\n* ☐ todo\n* ☑ done',
  );
});

test('four-space nesting counts as one level', () => {
  assert.equal(convert('- a', '    - b', '        - c'), '* a\n** b\n*** c');
});

test('a list continues across blank lines but a paragraph ends it', () => {
  assert.equal(convert('- a', '', '  - b', 'text', '- c'), '* a\n\n** b\ntext\n* c');
});

test('blockquotes and rules', () => {
  assert.equal(convert('> quoted', '---', '* * *'), 'bq. quoted\n----\n----');
});

test('tables with a header row, empty cells and inline formatting', () => {
  assert.equal(
    convert('| Name | Value |', '| --- | :-: |', '| **a** | |', '| b | `c` |'),
    '||Name||Value||\n|*a*| |\n|b|{{c}}|',
  );
});

test('images', () => {
  assert.equal(convert('![shot](https://x.test/a.png)'), '!https://x.test/a.png!');
});
