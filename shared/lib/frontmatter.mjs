// Minimal frontmatter parser: flat `key: value` pairs and inline lists
// (`labels: [a, b]`). Deliberately not YAML, so the skill needs no dependencies.

const FENCE = /^---\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;

export function parseFrontmatter(text) {
  const match = FENCE.exec(text);
  if (!match) return { data: {}, body: text };

  const data = {};
  for (const line of (match[1] ?? '').split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx === -1) throw new Error(`Invalid frontmatter line: "${line}"`);
    data[line.slice(0, idx).trim()] = parseValue(line.slice(idx + 1).trim());
  }
  return { data, body: text.slice(match[0].length) };
}

function parseValue(raw) {
  if (raw.startsWith('[') && raw.endsWith(']')) {
    return raw
      .slice(1, -1)
      .split(',')
      .map((item) => unquote(item.trim()))
      .filter(Boolean);
  }
  return unquote(raw);
}

function unquote(value) {
  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.length > 1 && value.endsWith(quote)) {
    return value.slice(1, -1);
  }
  return value;
}
