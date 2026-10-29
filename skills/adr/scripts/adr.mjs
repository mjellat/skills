#!/usr/bin/env node
// CLI used by the adr skill. Results go to stdout as JSON, errors to stderr as
// plain text. Exit codes: 0 ok, 1 failed, 2 usage error.

import { realpathSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { scanAdrs } from './lib/adr.mjs';

const USAGE = `Usage: adr.mjs list [options]

Commands:
  list                           Find the project's ADRs (JSON)
    --match <a,b,c>              Only ADRs that mention one of these terms, best first
    --title <text>               Also give the number and file name for a new ADR
`;

class CliError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

export function main(argv, io = {}) {
  const { cwd = process.cwd(), out = (text) => process.stdout.write(text), err = (text) => process.stderr.write(text) } = io;

  try {
    const [command, ...rest] = argv;
    if (command !== 'list') {
      throw new CliError(command ? `Unknown command "${command}"\n\n${USAGE}` : USAGE, 2);
    }
    let values;
    try {
      ({ values } = parseArgs({ args: rest, options: { match: { type: 'string' }, title: { type: 'string' } }, strict: true }));
    } catch (error) {
      throw new CliError(`${error.message}\n\n${USAGE}`, 2);
    }
    out(`${JSON.stringify(scanAdrs({ cwd, match: values.match?.split(',') ?? [], title: values.title }), null, 2)}\n`);
    return 0;
  } catch (error) {
    err(`${error.message}\n`);
    return error instanceof CliError ? error.code : 1;
  }
}

const entry = process.argv[1] && realpathSync(process.argv[1]);
if (entry && import.meta.url === pathToFileURL(entry).href) {
  process.exitCode = main(process.argv.slice(2));
}
