# skills

Agent skills, installable with the [skills CLI](https://github.com/vercel-labs/skills) (skills.sh).

| Skill | What it does |
|---|---|
| [`create-ticket`](#create-ticket) | Writes a ticket from a template and creates it in GitHub, Jira or GitLab. |
| [`adr`](#adr) | Finds, checks and writes Architecture Decision Records in the project's own format. |
| [`refine-ticket`](#refine-ticket) | Refines an existing ticket against the codebase and the ADRs, records decisions as ADRs, and splits tickets that are too big into linked stories. |

All need Node.js 20 or newer; the two ticket skills read the same tracker configuration. `refine-ticket` calls `adr` for ADR lookups and for recording decisions, so install them together. Add `-g` to install for all projects, or `-a claude-code` to pick the agent.

```bash
npx skills add mjellat/skills --skill create-ticket
npx skills add mjellat/skills --skill refine-ticket
npx skills add mjellat/skills --skill adr
```

## create-ticket

Writes a ticket from a template and, if you have configured a tracker, creates it there. Supports **GitHub Issues**, **Jira** (Cloud and Data Center) and **GitLab Issues**. Without configuration it only drafts the ticket, so it is useful out of the box.

Ask your agent in plain words:

> Write a bug ticket for the crash we just found in the importer.
>
> File a feature request for CSV export.

The agent picks a template, then searches your repository for the facts the ticket needs: affected code, existing behavior, versions, history. It asks you only about what the repository can't tell, with concrete questions built on what it found. Then it shows you the draft, with assumptions and open questions marked, and (if configured) asks before creating it.

`bug`, `feature` and `task` templates are included. Put your own in `.tickets/templates/` (per project) or `~/.config/ticket-skill/templates/` (for everyone); a template with the same name replaces the bundled one. See [`template-format.md`](skills/create-ticket/references/template-format.md).

## refine-ticket

Takes an existing ticket and makes it ready to implement. Give it a number, a key or a URL:

> Refine #42.
>
> Is ABC-123 ready for the sprint?

The agent reads the ticket, goes through the codebase again, and looks up the project's **ADRs**. It then asks targeted questions in three groups: **scope** (Abgrenzung), **domain rules** (Fachlichkeit) and **technical approach** (technische Umsetzung). It skips whatever the code or an ADR already answers, and it names the ADRs that apply instead of asking about them. If the ticket conflicts with an ADR, it says so.

When a decision made along the way is architecturally significant, it hands it to the [`adr`](#adr) skill, which drafts the ADR. The refined ticket links to the ADRs it follows or creates.

If the ticket is **too big for one iteration**, the agent proposes how to split it before anything else: a table of vertical slices (title, goal, the acceptance criteria each takes, dependencies) with the cut it used and a recommendation. You can accept it, move criteria between stories, or keep the ticket whole. After you confirm, the stories are created (with `create-ticket`), the original ticket becomes the umbrella with a task list of its stories, and every story is linked to it: as a sub-issue on GitHub, as an issue link on GitLab and Jira.

After you confirm, it replaces title and body in the tracker and can post a comment that records what changed. Before it writes, it saves the previous version to a backup file, and it stops if somebody edited the ticket in the meantime. Labels, assignees and state are never touched.

## adr

Finds, checks and writes **Architecture Decision Records**. You can use it on its own:

> Which ADRs do we have about messaging?
>
> Write an ADR for using RabbitMQ for order events.
>
> Does moving to GraphQL conflict with an ADR?

It finds the ADRs that bear on a topic with their status (following `superseded by` to the newer one), and says whether a change follows or conflicts with them. To record a decision it first checks that one is needed, then drafts the ADR in the project's own format and numbering (adr-tools, MADR or Nygard; `docs/adr/` if there is none yet). The file is written only after you agree, and it is never committed. An accepted ADR is never rewritten: a changed decision gets a new ADR that supersedes the old one.

Other skills call it too; `refine-ticket` does when it needs to look up or record a decision.

## Connect a tracker

Ask the agent to "set up create-ticket", or create `.tickets/config.json` yourself:

```json
{
  "provider": "github",
  "github": { "repo": "acme/app" }
}
```

Then export the token the tracker needs (`GITHUB_TOKEN`, `GITLAB_TOKEN`, or `JIRA_EMAIL` and `JIRA_API_TOKEN`). The config only names variables and never contains secrets. Full options for each tracker are in [`config.md`](shared/docs/config.md).

## Safety

- Nothing is created, changed, linked or written without your confirmation. `create-ticket` can skip the question with `"autoCreate": true`; `refine-ticket` always asks.
- Tokens come from environment variables, are never written to files, and are never printed. `--dry-run` shows the exact request without credentials.
- Failed requests that might have gone through are never retried automatically, so you don't get duplicates.
- `http://` tracker URLs are refused, except for `localhost`.

## Development

```bash
npm test          # sync check, then all tests
npm run sync      # copy shared/ into the skills
```

Skills are installed one by one, so a skill cannot import from the repository root or from a sibling. Code and docs that both skills need live once in [`shared/`](shared) and are copied into each skill by `scripts/sync-shared.mjs`. Edit the original, run `npm run sync`, and commit the copies; the tests fail if a copy is stale.

The scripts use only Node built-ins. Tests run against mocked `fetch`; they never contact a tracker.

## License

MIT, see [LICENSE](LICENSE).
