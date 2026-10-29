import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONNECTIONS, resolveSecrets, validateConfig } from '../shared/connection.mjs';
import { request } from '../http.mjs';
import * as github from './github.mjs';
import * as gitlab from './gitlab.mjs';
import * as jira from './jira.mjs';

const TRACKERS = { github, gitlab, jira };

// Fingerprint of the body as the tracker returned it. `update --expect-hash`
// uses it to notice that someone edited the ticket after it was read.
export const hashBody = (body) => createHash('sha256').update(body).digest('hex').slice(0, 16);

function connect(config, env, { credentials = true } = {}) {
  const problems = validateConfig(config);
  if (problems.length) throw new Error(`Invalid configuration: ${problems.join('; ')}`);
  const name = config.provider;
  const ctx = { name, cfg: config[name], tracker: TRACKERS[name] };
  if (!credentials) return ctx;

  const { values, missing } = resolveSecrets(config, env);
  if (missing.length) throw new Error(`Missing environment variable: ${missing.join(', ')}`);
  return { ...ctx, secrets: values, headers: CONNECTIONS[name].headers(values, ctx.cfg) };
}

const send = (ctx, spec, io, extra = {}) =>
  request({ ...spec, headers: ctx.headers, secrets: ctx.secrets, fetchImpl: io.fetchImpl, timeoutMs: io.timeoutMs, ...extra });

async function fetchTicket(ctx, id, io) {
  const { json } = await send(ctx, ctx.tracker.get(id, ctx.cfg), io);
  const ticket = ctx.tracker.normalize(json, ctx.cfg);
  return { provider: ctx.name, ...ticket, bodyHash: hashBody(ticket.body) };
}

export async function getTicket(config, ref, io = {}) {
  const ctx = connect(config, io.env);
  return fetchTicket(ctx, ctx.tracker.parseRef(ref, ctx.cfg), io);
}

// Pure and secret-free, so it is safe to print for --dry-run.
export function planUpdate(config, ref, ticket) {
  const ctx = connect(config, undefined, { credentials: false });
  return { provider: ctx.name, ...ctx.tracker.update(ctx.tracker.parseRef(ref, ctx.cfg), ticket, ctx.cfg) };
}

export function planComment(config, ref, markdown) {
  const ctx = connect(config, undefined, { credentials: false });
  return { provider: ctx.name, ...ctx.tracker.comment(ctx.tracker.parseRef(ref, ctx.cfg), markdown, ctx.cfg) };
}

function writeBackup(dir, current) {
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const path = join(dir, `${current.provider}-${current.id.replace(/[^\w-]/g, '')}-${stamp}.json`);
  writeFileSync(path, `${JSON.stringify(current, null, 2)}\n`, { mode: 0o600 });
  return path;
}

// Reads the ticket, saves it to a backup file, then replaces title and body.
// Labels, assignees and state are not touched.
export async function updateTicket(config, ref, ticket, io = {}) {
  const ctx = connect(config, io.env);
  const id = ctx.tracker.parseRef(ref, ctx.cfg);

  const current = await fetchTicket(ctx, id, io);
  if (io.expectHash && io.expectHash !== current.bodyHash) {
    throw new Error(
      `${current.id} was edited after you read it (body hash ${current.bodyHash}, expected ${io.expectHash}). ` +
        'Nothing was changed. Read the ticket again and merge the new edits.',
    );
  }
  const backup = writeBackup(io.backupDir ?? join(tmpdir(), 'refine-ticket-backups'), current);

  await send(ctx, ctx.tracker.update(id, ticket, ctx.cfg), io);
  return { ok: true, provider: ctx.name, id: current.id, url: current.url, backup };
}

// Offline and secret-free. GitHub needs the child's internal id, which only a
// read can tell, so the plan shows a placeholder for it.
export function planLink(config, parentRef, childRef) {
  const ctx = connect(config, undefined, { credentials: false });
  const parent = ctx.tracker.parseRef(parentRef, ctx.cfg);
  const child = ctx.tracker.parseRef(childRef, ctx.cfg);
  return { provider: ctx.name, ...ctx.tracker.link(parent, child, '<internal id, read at run time>', ctx.cfg) };
}

// Links a child ticket to its parent. The child is read first so a wrong
// reference fails before anything is written.
export async function linkTickets(config, parentRef, childRef, io = {}) {
  const ctx = connect(config, io.env);
  const parent = ctx.tracker.parseRef(parentRef, ctx.cfg);
  const child = ctx.tracker.parseRef(childRef, ctx.cfg);
  if (parent === child) throw new Error('A ticket cannot be linked to itself');

  const { json } = await send(ctx, ctx.tracker.get(child, ctx.cfg), io);
  const childTicket = ctx.tracker.normalize(json, ctx.cfg);
  await send(ctx, ctx.tracker.link(parent, child, json.id, ctx.cfg), io, { retrySafe: false });
  const label = (id) => (ctx.name === 'jira' ? id : `#${id}`);
  return { ok: true, provider: ctx.name, parent: label(parent), child: childTicket.id };
}

export async function addComment(config, ref, markdown, io = {}) {
  const ctx = connect(config, io.env);
  const id = ctx.tracker.parseRef(ref, ctx.cfg);
  const { json } = await send(ctx, ctx.tracker.comment(id, markdown, ctx.cfg), io, { retrySafe: false });
  return { ok: true, provider: ctx.name, ticket: ctx.name === 'jira' ? id : `#${id}`, commentUrl: json?.html_url ?? null };
}
