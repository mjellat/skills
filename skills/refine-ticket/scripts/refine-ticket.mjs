#!/usr/bin/env node
// CLI used by the refine-ticket skill. Results go to stdout as JSON, errors to
// stderr as plain text. Exit codes: 0 ok, 1 failed, 2 usage error, 3 not configured.

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { scanAdrs } from './lib/adr.mjs';
import { findProjectDir, globalDir, loadConfig } from './lib/shared/config-file.mjs';
import { resolveSecrets, validateConfig } from './lib/shared/connection.mjs';
import { parseTicket } from './lib/shared/ticket.mjs';
import { addComment, getTicket, linkTickets, planComment, planLink, planUpdate, updateTicket } from './lib/trackers/index.mjs';

const USAGE = `Usage: refine-ticket.mjs <command> [options]

Commands:
  check                          Report config, tracker and credential status (JSON)
  get <ticket>                   Read a ticket: number, key (ABC-12) or URL (JSON)
  update <ticket> --file <f.md>  Replace title and body with the refined ticket
    --expect-hash <hash>         Abort if the ticket changed since "get" (use the bodyHash from "get")
    --backup-dir <dir>           Where the previous version is saved (default: temp dir)
    --dry-run                    Print the request, send nothing
  comment <ticket> --file <f.md> Add a comment
    --dry-run                    Print the request, send nothing
  link <parent> <child>          Link a child ticket to its parent (after splitting a ticket)
    --dry-run                    Print the request, send nothing
  adrs                           Find the project's ADRs (JSON)
    --match <a,b,c>              Only ADRs that mention one of these terms, best first
    --title <text>               Also give the number and file name for a new ADR
`;

class CliError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

export async function main(argv, io = {}) {
  const {
    env = process.env,
    cwd = process.cwd(),
    out = (text) => process.stdout.write(text),
    err = (text) => process.stderr.write(text),
    fetchImpl,
    backupDir,
    ...pathOpts // home: test hook for the global config location
  } = io;
  const opts = { cwd, env, ...pathOpts };
  const net = { env, fetchImpl, backupDir };
  const print = (value) => out(`${JSON.stringify(value, null, 2)}\n`);

  try {
    const [command, ...rest] = argv;
    switch (command) {
      case 'check':
        print(check(opts));
        return 0;
      case 'get': {
        const { positionals } = parse(rest, {});
        print(await getTicket(requireConfig(opts), requireRef(positionals), net));
        return 0;
      }
      case 'update':
        print(await update(rest, opts, net));
        return 0;
      case 'comment':
        print(await comment(rest, opts, net));
        return 0;
      case 'link':
        print(await link(rest, opts, net));
        return 0;
      case 'adrs': {
        const { values } = parse(rest, { match: { type: 'string' }, title: { type: 'string' } });
        print(scanAdrs({ cwd, match: values.match?.split(',') ?? [], title: values.title }));
        return 0;
      }
      default:
        throw new CliError(command ? `Unknown command "${command}"\n\n${USAGE}` : USAGE, 2);
    }
  } catch (error) {
    err(`${error.message}\n`);
    return error instanceof CliError ? error.code : 1;
  }
}

function parse(args, options) {
  try {
    return parseArgs({ args, options: { 'dry-run': { type: 'boolean' }, ...options }, allowPositionals: true, strict: true });
  } catch (error) {
    throw new CliError(`${error.message}\n\n${USAGE}`, 2);
  }
}

function requireRef(positionals) {
  if (!positionals[0]) throw new CliError('A ticket reference is needed: number, key (ABC-12) or URL', 2);
  return positionals[0];
}

function requireConfig(opts) {
  const loaded = loadConfig(opts);
  if (!loaded) {
    throw new CliError('No ticket system configured. Run "check" for where to put the config, or work from pasted ticket text.', 3);
  }
  const problems = validateConfig(loaded.config);
  if (problems.length) throw new CliError(`Invalid configuration in ${loaded.path}: ${problems.join('; ')}`);
  return loaded.config;
}

function readDraft(file) {
  if (!file) throw new CliError('--file <draft.md> is needed', 2);
  if (!existsSync(file)) throw new CliError(`File not found: ${file}`, 2);
  return readFileSync(file, 'utf8');
}

function check(opts) {
  const loaded = loadConfig(opts);
  if (!loaded) {
    const projectDir = findProjectDir(opts.cwd);
    return {
      configured: false,
      hint: 'No config found. Without one the skill works from ticket text you paste and cannot read or update a tracker.',
      createAt: projectDir ? `${projectDir}/config.json` : `${opts.cwd}/.tickets/config.json`,
      orGlobally: `${globalDir(opts)}/config.json`,
    };
  }

  const { config, scope, path } = loaded;
  const problems = validateConfig(config);
  const result = { configured: true, scope, path, provider: config?.provider ?? null, problems };
  if (problems.length) return { ...result, ready: false };

  const { missing, status } = resolveSecrets(config, opts.env);
  return { ...result, credentials: status, ready: missing.length === 0 };
}

async function update(args, opts, net) {
  const { values, positionals } = parse(args, {
    file: { type: 'string' },
    'expect-hash': { type: 'string' },
    'backup-dir': { type: 'string' },
  });
  const ref = requireRef(positionals);
  const ticket = parseTicket(readDraft(values.file));
  const config = requireConfig(opts);

  if (values['dry-run']) {
    const { provider, method, url, body } = planUpdate(config, ref, ticket);
    return { dryRun: true, provider, method, url, body };
  }
  return updateTicket(config, ref, ticket, {
    ...net,
    expectHash: values['expect-hash'],
    backupDir: values['backup-dir'] ?? net.backupDir,
  });
}

async function comment(args, opts, net) {
  const { values, positionals } = parse(args, { file: { type: 'string' } });
  const ref = requireRef(positionals);
  const markdown = readDraft(values.file).trim();
  if (!markdown) throw new CliError('The comment file is empty', 2);
  const config = requireConfig(opts);

  if (values['dry-run']) {
    const { provider, method, url, body } = planComment(config, ref, markdown);
    return { dryRun: true, provider, method, url, body };
  }
  return addComment(config, ref, markdown, net);
}

async function link(args, opts, net) {
  const { values, positionals } = parse(args, {});
  const [parent, child] = positionals;
  if (!parent || !child) throw new CliError('A parent and a child ticket are needed: link <parent> <child>', 2);
  const config = requireConfig(opts);

  if (values['dry-run']) {
    const { provider, method, url, body } = planLink(config, parent, child);
    return { dryRun: true, provider, method, url, body };
  }
  return linkTickets(config, parent, child, net);
}

const entry = process.argv[1] && realpathSync(process.argv[1]);
if (entry && import.meta.url === pathToFileURL(entry).href) {
  process.exitCode = await main(process.argv.slice(2));
}
