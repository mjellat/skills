---
name: refine-ticket
description: Refine an existing ticket (story, bug, task) before implementation. Re-researches the codebase, finds the project's ADRs and references them, asks targeted questions about scope, domain rules and technical approach, records architecture decisions made along the way as new ADRs, proposes a sensible split into linked stories when a ticket is too big for one iteration, and writes the sharpened ticket back to GitHub, Jira or GitLab. Use whenever the user wants to refine, groom, sharpen, detail or review a ticket or story, prepares a refinement or planning session, or asks whether a ticket is ready to implement, even if they only give a ticket number.
---

# Refine ticket

Takes a ticket that already exists, usually one written with `create-ticket`, and makes it ready to implement: clear boundaries, explicit domain rules, and a technical approach grounded in the code and in the project's Architecture Decision Records (ADRs).

The skill researches first, asks only about what the codebase and the ADRs cannot answer, and records architecturally significant decisions as ADRs. **Nothing is written to the tracker or to the repository without the user's yes.**

Helper script: `scripts/refine-ticket.mjs` in this skill's directory (the one containing this file). Run it with `node <skill-dir>/scripts/refine-ticket.mjs <command>`. It needs Node.js 20 or newer and no packages, and it reads the same `.tickets/config.json` as `create-ticket`. Results are JSON on stdout, errors are plain text on stderr.

## Workflow

### 1. Get the ticket

```bash
node <skill-dir>/scripts/refine-ticket.mjs check
node <skill-dir>/scripts/refine-ticket.mjs get <ticket>
```

`<ticket>` is a number, a key such as `ABC-12`, or a URL. Keep the `bodyHash` from `get` for step 8. Jira bodies arrive as wiki markup (`format: "jira-wiki"`): read them as they are and write your refined version in Markdown.

If `check` shows no config, or `ready: false`, or the user pasted the ticket or named a file, work from that text instead. The result is then the refined text for the user to paste, so skip the tracker parts of steps 7 and 8 and mention how to set up (`references/config.md`). If the ticket is already closed or done, ask whether to go on.

### 2. Assess the ticket

Read `references/refinement-guide.md` now. Read the ticket as the person who has to implement it and note, for each of the three areas, what is settled, vague or missing:

- **Scope** (Abgrenzung): what is in and out, where it borders neighbouring features and tickets, whether it is one ticket or too big and should be split into linked stories (see "Splitting a ticket that is too big" in the guide).
- **Domain rules** (Fachlichkeit): actors, triggers, business rules, edge and error cases, data, legal or compliance points, acceptance criteria.
- **Technical approach** (technische Umsetzung): where it plugs in, data and API changes, integration, non-functional needs, testing, rollout.

### 3. Research the codebase and the ADRs

Go through the codebase again, deeper than when the ticket was written: the code the ticket touches, similar features and how they are built, domain models and flows, tests, config, dependencies and versions. Start from the ticket's own terms, widen only when nothing turns up, and never open secret files (`.env`, keys, credential stores). Note each finding with its source (`path:line`).

Then the ADRs:

```bash
node <skill-dir>/scripts/refine-ticket.mjs adrs --match "<terms from the ticket>"
```

Read the matching ADRs in full. Run a second query with synonyms and with the topics that usually carry decisions (persistence, messaging, auth, API style, error handling, deployment), because an ADR's title may not use the ticket's words. Treat `accepted` ADRs as binding, mention `proposed` ones, and follow `supersededBy` instead of citing a superseded ADR. For each relevant ADR the refinement ends in one of two ways: "we follow ADR-N", or a conflict to raise in step 4.

### 4. Ask targeted questions

Sort every open point as **found**, **ambiguous** or **missing**:

- **Found** in the code, an ADR, the ticket or the conversation: do not ask. If an ADR already decides it, reference the ADR and move on.
- **Ambiguous**, or the ticket **conflicts with an ADR or the code**: ask, with the candidates you found as options.
- **Missing**, and only the user can know it: ask.

How to ask:

- One round, grouped under **Scope**, **Domain** and **Technical**. At most three questions per group, most important first, and skip a group with nothing open. If the ticket is too big for one iteration, the split proposal is the first Scope question (see below). Use your structured question tool if you have one, otherwise a numbered list.
- Begin with what you found: the code that matters, the ADRs that apply, and the assumptions you are about to make, so wrong ones get corrected.
- Build every question on a finding. Where there are choices, offer the options with their consequences and say which you recommend and why. Never ask "can you give me more details?".
- **Split proposal.** The guide lists the signals of a ticket that is too big and how to cut it. When they apply, propose the split as a table (order, working title, goal, acceptance criteria it takes, depends on), name the cut you used, and recommend. The user can accept it, move criteria, merge or add stories, or keep the ticket whole. Ask the Domain and Technical questions about the ticket as a whole; their answers are sorted into the stories afterwards. Don't propose a split for a ticket that merely is long.
- Technical choices that shape the work belong here, unlike when a ticket is first written. Offer the approaches the code and the ADRs support, with the consequence of each.
- If a choice is architecturally significant, also ask for the reason behind the user's pick (one line), because an ADR without a reason is worth little.
- If the answers open a real new gap, one short follow-up round at most. What stays unanswered becomes an open question in the ticket. If the user tells you to skip the questions, skip them and refine with what you have.

### 5. Record decisions as ADRs

Decide for each decision made in steps 3 and 4 whether it needs an ADR. Read `references/adr-guide.md` for the criteria. In short: write one for decisions that are hard to reverse or that shape structure, technology, integration or data, and for any that deviate from an existing ADR. Don't write one for details that only concern this ticket, or for what an ADR already decides.

For each ADR:

```bash
node <skill-dir>/scripts/refine-ticket.mjs adrs --title "<decision as a statement>"
```

This returns the ADR directory, its `format` and the `next` number and path. Follow the project's own format. If there are no ADRs yet, ask before creating a directory (`docs/adr/` is the usual choice) and use `templates/adr-madr.md`. Show the full ADR draft with status `proposed` (unless the user says it is accepted) and write the file only after their yes. Don't commit it. When an ADR replaces an older one, change the old one's status line only after a separate yes.

### 6. Write the refined ticket

Write the refined ticket to a temporary file outside the repository: a `# Title` heading followed by the body in Markdown. Build on the original. Keep what is still right and sharpen the rest. `references/refinement-guide.md` describes the structure: the template's own sections, plus scope in and out, business rules, testable acceptance criteria, the technical approach with code pointers, the decisions and ADRs (number, title, status, path or link), dependencies and risks, and open questions.

If a split was agreed, this step produces several files: the parent as an umbrella (shared goal, rules and decisions, the list of stories) and one draft per story, in dependency order. Each story starts with "Part of <parent reference>", takes its share of the acceptance criteria (every criterion in exactly one story), and gets its own scope, rules and technical approach. Use the layout in `references/refinement-guide.md`. Give the stories the `type` and `labels` of the parent in their frontmatter, unless the user says otherwise.

- Everything concrete must trace back to the code, an ADR, the ticket or an answer. Mark inferences as assumptions and unknowns as open questions. Never invent file paths, versions or reasons.
- Write in the ticket's language. Keep secrets, tokens and personal data out.
- Labels, assignees and state are not touched. Only title and body are replaced.

### 7. Show and confirm

Show the user: a short summary of what changed compared with the original (new decisions, changed scope, open questions), the complete refined ticket, and any ADR drafts or paths. With a split, show the umbrella and every story in full, and say which tracker will receive how many new tickets. Ask for confirmation to write it to the tracker, and in the same question whether to post a comment that records what changed. A yes covers this ticket, and with a split the stories shown; it covers no others. If they want changes, edit the file and show it again.

### 8. Write it back

```bash
node <skill-dir>/scripts/refine-ticket.mjs update <ticket> --file <refined> --dry-run
node <skill-dir>/scripts/refine-ticket.mjs update <ticket> --file <refined> --expect-hash <bodyHash from step 1>
```

The dry run prints the request without sending it. The real run reads the ticket, saves its previous version to a backup file, then replaces title and body. It stops without changing anything if the ticket was edited after step 1. In that case read it again with `get`, merge the new edits into your version and confirm again. Report the `url` and the `backup` path.

If the user agreed to a comment, post it only after the update succeeded:

```bash
node <skill-dir>/scripts/refine-ticket.mjs comment <ticket> --file <comment>
```

The comment states the date, the decisions with their ADR references, the scope changes and the open questions. It is not retried automatically, because a retry could post it twice.

#### With a split: create the stories, then link them

Do this after the confirmation in step 7, in this order, so the parent can list real references:

1. Create the stories in dependency order. Use the `create-ticket` skill's script for it (`create --file <story> --dry-run`, then `create --file <story>`; see that skill's step 7). It returns each story's `id` and `url`. Add "Needs <id>" to a later story only for stories already created. If `create-ticket` is not installed or the tracker is not ready, give the user the story drafts to create by hand and stop after the parent update, with the story list left as plain titles.
2. Update the parent as in the steps above. Put the references of the created stories into its "Stories" task list before you write it.
3. Link each story to the parent:

   ```bash
   node <skill-dir>/scripts/refine-ticket.mjs link <parent> <story> --dry-run
   node <skill-dir>/scripts/refine-ticket.mjs link <parent> <story>
   ```

   GitHub makes the story a sub-issue of the parent. GitLab and Jira get an issue link ("relates to", or `jira.linkType`, default `Relates`). A link is not retried automatically.

Report every story with its reference and URL, and whether it is linked. If creating a story fails, stop and report: stories created so far stay, and nothing is created twice without the user's say.

If a request fails, report the error as printed. HTTP 403 means the token lacks permission to edit or comment (see `references/config.md`). "may or may not have gone through" means: read the ticket again before doing anything else.

## Setup

The skill uses the configuration of `create-ticket`: `.tickets/config.json` in the project, or `~/.config/ticket-skill/config.json` for every project. `references/config.md` has the schema, the token permissions (reading and editing issues, adding comments) and the environment variables. Never ask for a token in chat and never write one into a file.
