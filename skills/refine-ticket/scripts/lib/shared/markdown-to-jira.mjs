// Copy of shared/lib/markdown-to-jira.mjs. Edit the original and run "node scripts/sync-shared.mjs".
// Small Markdown -> Jira wiki markup converter. It covers what ticket templates
// use (headings, emphasis, code, lists, checkboxes, links, quotes, tables) and
// is not a general-purpose Markdown implementation.

const OPEN = '';
const CLOSE = '';

export function markdownToJira(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let list = []; // stack of { indent, marker } for the list currently being written

  for (let i = 0; i < lines.length; ) {
    const line = lines[i];

    const fence = /^\s*(```|~~~)\s*([\w+#-]*)(?:\s.*)?$/.exec(line);
    if (fence) {
      const code = [];
      for (i++; i < lines.length && !/^\s*(```|~~~)\s*$/.test(lines[i]); i++) code.push(lines[i]);
      i++; // closing fence
      out.push(fence[2] ? `{code:${fence[2]}}` : '{code}', ...code, '{code}');
      list = [];
      continue;
    }

    if (isTableRow(line)) {
      const rows = [];
      while (i < lines.length && isTableRow(lines[i])) rows.push(lines[i++]);
      out.push(...convertTable(rows));
      list = [];
      continue;
    }

    i++;
    const item = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (item && !isRule(line)) {
      out.push(convertListItem(list, item));
      continue;
    }
    if (line.trim()) list = []; // blank lines keep the list open, anything else ends it
    out.push(convertLine(line));
  }
  return out.join('\n');
}

function isTableRow(line) {
  return /^\s*\|.*\|\s*$/.test(line);
}

function isRule(line) {
  return /^\s*([-*_])(\s*\1){2,}\s*$/.test(line);
}

function convertListItem(list, [, indentText, bullet, rest]) {
  const indent = indentText.replace(/\t/g, '    ').length;
  const marker = /\d/.test(bullet) ? '#' : '*';

  while (list.length && list[list.length - 1].indent > indent) list.pop();
  if (list.length && list[list.length - 1].indent === indent) list[list.length - 1].marker = marker;
  else list.push({ indent, marker });

  const prefix = list.map((entry) => entry.marker).join('');
  const task = /^\[([ xX])\]\s+(.*)$/.exec(rest);
  if (task) return `${prefix} ${task[1] === ' ' ? '☐' : '☑'} ${inline(task[2])}`;
  return `${prefix} ${inline(rest)}`;
}

function convertLine(line) {
  let match;
  if ((match = /^(#{1,6})\s+(.*)$/.exec(line))) return `h${match[1].length}. ${inline(match[2].trimEnd())}`;
  if (isRule(line)) return '----';
  if ((match = /^\s*>\s?(.*)$/.exec(line))) return `bq. ${inline(match[1])}`;
  return inline(line);
}

function convertTable(rows) {
  const split = (row) =>
    row
      .trim()
      .replace(/^\||\|$/g, '')
      .split(/(?<!\\)\|/)
      .map((cell) => cell.trim());
  const cells = rows.map(split);
  const isSeparator = (row) => row.every((cell) => /^:?-+:?$/.test(cell));
  const cell = (text) => inline(text) || ' '; // Jira needs a space in empty cells

  const out = [];
  let body = cells;
  if (cells.length > 1 && isSeparator(cells[1])) {
    out.push(`||${cells[0].map(cell).join('||')}||`);
    body = cells.slice(2);
  }
  for (const row of body) out.push(`|${row.map(cell).join('|')}|`);
  return out;
}

function inline(text) {
  const stash = [];
  const keep = (value) => {
    stash.push(value);
    return `${OPEN}${stash.length - 1}${CLOSE}`;
  };
  const escapeBraces = (value) => value.replace(/[{}]/g, '\\$&');

  let s = text;
  s = s.replace(/`([^`]+)`/g, (_, code) => keep(`{{${escapeBraces(code)}}}`));
  s = s.replace(/!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g, (_, url) => keep(`!${url}!`));
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (_, label, url) => keep(`[${label}|${url}]`));
  s = s.replace(/<(https?:\/\/[^>\s]+)>/g, '$1');

  s = escapeBraces(s).replace(/\[/g, '\\[');

  s = s.replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, (_, __, body) => `${keep('*')}${body}${keep('*')}`);
  s = s.replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\w*])/g, '$1_$2_');
  s = s.replace(/~~(?=\S)(.+?)(?<=\S)~~/g, (_, body) => `${keep('-')}${body}${keep('-')}`);

  // Stashed values can themselves contain stash markers (link labels with code).
  const marker = new RegExp(`${OPEN}(\\d+)${CLOSE}`, 'g');
  for (let pass = 0; pass < 5 && s.includes(OPEN); pass++) {
    s = s.replace(marker, (_, index) => stash[Number(index)]);
  }
  return s;
}
