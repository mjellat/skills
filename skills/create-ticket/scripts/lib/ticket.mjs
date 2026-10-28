// Turns a drafted ticket file (template frontmatter + filled-in Markdown)
// into the provider-neutral shape the providers consume.

import { parseFrontmatter } from './frontmatter.mjs';

function toList(value) {
  if (value === undefined || value === '') return [];
  const items = Array.isArray(value) ? value : String(value).split(',');
  return items.map((item) => String(item).trim()).filter(Boolean);
}

export function parseTicket(text) {
  const { data, body } = parseFrontmatter(text);

  // Template hints are HTML comments; drop whatever the draft left behind.
  const lines = body.replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/);

  let titleIndex = -1;
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) inFence = !inFence;
    if (!inFence && /^#\s+\S/.test(lines[i])) {
      titleIndex = i;
      break;
    }
  }
  if (titleIndex === -1) throw new Error('Ticket needs a title: a "# Title" heading');

  let title = lines[titleIndex].replace(/^#\s+/, '').trim();
  if (data.titlePrefix && !title.startsWith(data.titlePrefix)) title = data.titlePrefix + title;

  lines.splice(titleIndex, 1);
  const ticketBody = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!ticketBody) throw new Error('Ticket body is empty');

  return {
    title,
    body: ticketBody,
    labels: toList(data.labels),
    assignees: toList(data.assignees),
    type: data.type || null,
  };
}
