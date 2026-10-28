# skills

Agent skills, installable with the [skills CLI](https://github.com/vercel-labs/skills) (skills.sh).

## create-ticket

Writes a ticket from a template and, if you have configured a tracker, creates it there. Supports **GitHub Issues**, **Jira** (Cloud and Data Center) and **GitLab Issues**. Without configuration it only drafts the ticket, so it is useful out of the box.

```bash
npx skills add mjellat/skills --skill create-ticket
```

Add `-g` to install it for all projects, or `-a claude-code` to pick the agent. Requires Node.js 20 or newer.

### Use it

Ask your agent in plain words:

> Write a bug ticket for the crash we just found in the importer.
>
> File a feature request for CSV export.

The agent picks a template, then searches your repository for the facts the ticket needs: affected code, existing behavior, versions, history. It asks you only about what the repository can't tell, with concrete questions built on what it found. Then it shows you the draft, with assumptions and open questions marked, and (if configured) asks before creating it.

### Connect a tracker

Ask the agent to "set up create-ticket", or create `.tickets/config.json` yourself:

```json
{
  "provider": "github",
  "github": { "repo": "acme/app" }
}
```

Then export the token the tracker needs (`GITHUB_TOKEN`, `GITLAB_TOKEN`, or `JIRA_EMAIL` and `JIRA_API_TOKEN`). The config only names variables and never contains secrets. Full options for each tracker are in [`references/config.md`](skills/create-ticket/references/config.md).

### Templates

`bug`, `feature` and `task` are included. Put your own in `.tickets/templates/` (per project) or `~/.config/ticket-skill/templates/` (for everyone); a template with the same name replaces the bundled one. See [`references/template-format.md`](skills/create-ticket/references/template-format.md).

### Safety

- A ticket is only created after you confirm it, unless you set `"autoCreate": true`.
- Tokens come from environment variables, are never written to files, and are never printed. `--dry-run` shows the exact request without credentials.
- A failed request is never retried automatically, so you don't get duplicates.
- `http://` tracker URLs are refused, except for `localhost`.

### Development

```bash
node --test skills/create-ticket/scripts/test/
```

The scripts use only Node built-ins. Tests run against mocked `fetch`; they never contact a tracker.

## License

MIT, see [LICENSE](LICENSE).
