---
name: create-ticket
description: Write a well-structured ticket (bug report, feature request, task, user story) from a template and, when a tracker is configured, create it in GitHub Issues, Jira or GitLab. Use whenever the user wants to write, draft, file, log, open or create a ticket, issue, bug report, story or task, even if they name no tracker and don't ask for an upload.
---

# Create ticket

Two jobs: draft a ticket from a template, and, only when a tracker is configured and the user agrees, create it there. Without configuration the skill just produces the finished ticket text.

Helper script: `scripts/create-ticket.mjs` in this skill's directory (the one containing this file). Run it with `node <skill-dir>/scripts/create-ticket.mjs <command>`. It needs Node.js 20 or newer and no packages. Results are JSON on stdout, errors are plain text on stderr.

## Workflow

### 1. Check the setup

```bash
node <skill-dir>/scripts/create-ticket.mjs check
```

- `configured: false` means draft-only mode. Continue with steps 2 to 4, then stop and mention that a tracker can be set up (see "Setup").
- `problems` is non-empty or `ready: false` means the config or credentials are incomplete. `credentials` names the environment variables that are not set. Tell the user which, and carry on drafting.
- `ready: true` means the ticket can be created after the user confirms.

### 2. Pick a template

```bash
node <skill-dir>/scripts/create-ticket.mjs templates
node <skill-dir>/scripts/create-ticket.mjs show <name>
```

Choose by intent: something broken is `bug`, a new capability is `feature`, plain work is `task`. If the request fits none clearly, use `defaultTemplate` from `check`, or ask. Templates can come from the project, the user's global folder or the skill, so always read one with `show` instead of guessing a path.

### 3. Write the draft

Write the filled template to a temporary file outside the repository. Use the scratchpad or temp directory your environment provides.

- Keep the template's frontmatter (`type`, `labels`). Adjust labels only when the context calls for it. Do not invent assignees.
- Replace the title placeholder line with a concrete `# Title`. The title is the first top-level heading.
- Fill sections from the conversation and from the code. Read the relevant files, error output or recent changes when that makes the ticket more precise. Use real file paths, versions and error text.
- Never invent reproduction steps, versions or error messages. If a fact that matters is missing, ask one short question. Delete optional sections that have no content instead of leaving them empty.
- Remove the hint comments (`<!-- ... -->`). The script strips leftovers, but don't rely on it.
- Write in the user's language unless they say otherwise.
- Keep secrets, tokens and personal data out of the ticket, and redact them from pasted logs. Issues in public repositories are public.

### 4. Show the draft

Print the complete ticket for the user to read. If they want changes, edit the file and show it again.

### 5. Create it (configured and `ready` only)

Unless `autoCreate` is `true` in `check`, creating a ticket needs the user's explicit yes **for this ticket**. A yes for one ticket does not cover the next.

```bash
node <skill-dir>/scripts/create-ticket.mjs create --file <draft> --dry-run
```

The dry run prints the target URL and payload without sending anything and without credentials. Tell the user where the ticket will go (tracker, repository or project, labels, issue type), ask for confirmation, then:

```bash
node <skill-dir>/scripts/create-ticket.mjs create --file <draft>
```

Report the returned `id` and `url`. Pass on any `warnings` (for example assignees that Jira and GitLab cannot take by name).

### 6. If it fails

Report the error as it was printed and do not retry on your own. Retrying a request that may have succeeded creates duplicates.

- "may or may not have been created": ask the user to look in the tracker before anything else happens.
- HTTP 401 or 403: the token is wrong, expired or lacks permission. See `references/config.md` for the scopes each tracker needs.
- HTTP 404: the repository or project name is wrong, or the token cannot see it.
- HTTP 400 or 422 about the issue type or a label: the first request was rejected, so a corrected retry is safe. Change `type` in the draft's frontmatter, or the label, confirm with the user, and run `create` again.

## Setup

When the user asks to set up or configure ticket creation:

1. Ask which tracker (GitHub, Jira, GitLab) and for its coordinates: `owner/name`, the Jira site URL and project key, or the GitLab project path.
2. Write `.tickets/config.json` in the project (or `~/.config/ticket-skill/config.json` if they want it for every project). The schema and an example for each tracker are in `references/config.md`.
3. Tell the user which environment variables to set. **Never ask for a token in chat and never write one into a file.** The config holds variable names only.
4. Run `check` and confirm it reports `ready: true`.

## Custom templates

To change the bundled templates, copy one to `.tickets/templates/<name>.md` (or the global folder) and edit the copy. A template with the same name there wins. Don't edit the bundled files, because updating the skill would overwrite them. Format details are in `references/template-format.md`.
