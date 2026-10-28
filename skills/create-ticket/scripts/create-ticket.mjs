#!/usr/bin/env node
// CLI used by the create-ticket skill. Results go to stdout as JSON, errors to
// stderr as plain text. Exit codes: 0 ok, 1 failed, 2 usage error, 3 not configured.

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { findProjectDir, globalDir, listTemplates, loadConfig, loadTemplate } from './lib/config.mjs';
import { buildRequest, resolveSecrets, submit, validateConfig } from './lib/providers/index.mjs';
import { parseTicket } from './lib/shared/ticket.mjs';

const USAGE = `Usage: create-ticket.mjs <command> [options]

Commands:
  check                      Report config, provider and credential status (JSON)
  templates                  List available templates (JSON)
  show <template>            Print a template
  create --file <draft.md>   Create the ticket in the configured tracker
    --dry-run                Print the request that would be sent, send nothing
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
    ...pathOpts // home, bundledDir: test hooks for config.mjs
  } = io;
  const opts = { cwd, env, ...pathOpts };
  const print = (value) => out(`${JSON.stringify(value, null, 2)}\n`);

  try {
    const [command, ...rest] = argv;
    switch (command) {
      case 'check':
        print(check(opts));
        return 0;
      case 'templates':
        print(listTemplates(opts).map(({ name, description, source }) => ({ name, description, source })));
        return 0;
      case 'show': {
        const [name] = parse(rest, {}).positionals;
        if (!name) throw new CliError('show needs a template name', 2);
        out(loadTemplate(name, opts).content);
        return 0;
      }
      case 'create':
        print(await create(rest, opts, fetchImpl));
        return 0;
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
    return parseArgs({ args, options, allowPositionals: true, strict: true });
  } catch (error) {
    throw new CliError(`${error.message}\n\n${USAGE}`, 2);
  }
}

function check(opts) {
  const loaded = loadConfig(opts);
  if (!loaded) {
    const projectDir = findProjectDir(opts.cwd);
    return {
      configured: false,
      hint: 'No config found. Without one the skill only drafts the ticket. See references/config.md to set up a tracker.',
      createAt: projectDir ? `${projectDir}/config.json` : `${opts.cwd}/.tickets/config.json`,
      orGlobally: `${globalDir(opts)}/config.json`,
    };
  }

  const { config, scope, path } = loaded;
  const problems = validateConfig(config);
  const result = { configured: true, scope, path, provider: config?.provider ?? null, problems };
  if (problems.length) return { ...result, ready: false };

  const { missing, status } = resolveSecrets(config, opts.env);
  return {
    ...result,
    autoCreate: config.autoCreate === true,
    defaultTemplate: config.defaultTemplate ?? null,
    credentials: status, // names and whether they are set; values are never read out
    ready: missing.length === 0,
  };
}

async function create(args, opts, fetchImpl) {
  const { values } = parse(args, { file: { type: 'string' }, 'dry-run': { type: 'boolean' } });
  if (!values.file) throw new CliError('create needs --file <draft.md>', 2);
  if (!existsSync(values.file)) throw new CliError(`Draft not found: ${values.file}`, 2);

  const ticket = parseTicket(readFileSync(values.file, 'utf8'));

  const loaded = loadConfig(opts);
  if (!loaded) {
    throw new CliError('No ticket system configured, nothing was created. Run "check" for where to put the config.', 3);
  }
  const { config } = loaded;
  const problems = validateConfig(config);
  if (problems.length) throw new CliError(`Invalid configuration in ${loaded.path}: ${problems.join('; ')}`);

  if (values['dry-run']) {
    const { missing } = resolveSecrets(config, opts.env);
    const { provider, method, url, body, warnings } = buildRequest(config, ticket);
    return { dryRun: true, provider, method, url, body, warnings, missingCredentials: missing };
  }

  const result = await submit(config, ticket, { env: opts.env, ...(fetchImpl && { fetchImpl }) });
  return { ok: true, ...result };
}

// `skills add` installs by symlink by default. Node resolves symlinks for the
// main module but leaves process.argv[1] as typed, so compare real paths.
const entry = process.argv[1] && realpathSync(process.argv[1]);
if (entry && import.meta.url === pathToFileURL(entry).href) {
  process.exitCode = await main(process.argv.slice(2));
}
