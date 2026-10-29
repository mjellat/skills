---
name: adr
description: Find, check and write Architecture Decision Records (ADRs) in the project's own format and numbering (adr-tools, MADR or Nygard). Finds the ADRs that bear on a topic and their status, decides whether a decision deserves an ADR, drafts one, and writes it after the user agrees. Use when the user wants to record, document or write down an architecture decision or ADR, asks why something is built the way it is, wants to know whether a change conflicts with an existing ADR, or supersedes one. Other skills such as refine-ticket call it for ADR lookups and for recording decisions.
---

# ADR

An ADR (Architecture Decision Record) is a short document that says what was decided, why, and what follows from it, so that nobody has to ask "why is it built like this?" a year later.

This skill does two jobs: **find** the ADRs that apply to a topic, and **record** a decision as a new ADR. **Nothing is written to the repository without the user's yes, and nothing is committed.**

Helper script: `scripts/adr.mjs` in this skill's directory (the one containing this file). Run it with `node <skill-dir>/scripts/adr.mjs list`. It needs Node.js 20 or newer and no packages. The result is JSON on stdout, errors are plain text on stderr.

## When another skill calls this one

Skills such as `refine-ticket` hand over a task ("find the ADRs for these terms" or "record this decision") together with what they already know: the decision, the options discussed, the reason the user gave, the ticket. Use all of it and ask the user only for what is still missing. Give back what the caller needs: the ADRs that apply (number, title, status, path, url), or the new ADR's number, title, status and path. The caller puts the references into its own output.

## Find the ADRs for a topic

```bash
node <skill-dir>/scripts/adr.mjs list --match "<term>,<term>"
```

Without `--match` it lists all ADRs. Each entry has `number`, `title`, `status`, `date`, `supersededBy`, `path` and `url` (a link into the remote when the origin is on GitHub or GitLab). Read the matching ADRs in full: the script only reads the headline data.

- Run a second query with synonyms and with the topics that usually carry decisions (persistence, messaging, auth, API style, error handling, deployment), because an ADR's title may not use your words.
- Treat `accepted` ADRs as binding and mention `proposed` ones. Follow `supersededBy` to the newer ADR instead of citing a superseded one.
- `found: false` means the project has no ADR directory. Say so and carry on.

For each relevant ADR the result is one of two things: "we follow ADR-N", or a conflict. State a conflict plainly and offer the ways out: adapt the change to the ADR, or supersede the ADR with a new one.

## Record a decision

Read `references/adr-guide.md` first. It says which decisions deserve an ADR, what goes in one, and how superseding works.

1. **Decide** whether an ADR is needed. If an existing ADR already decides it, or it is a detail of one ticket, say so and write nothing.
2. **Get the file name and format:**

   ```bash
   node <skill-dir>/scripts/adr.mjs list --title "<decision as a statement>"
   ```

   The result gives the ADR directory, its `format` and `next` (file name and path). Follow the project's own format and numbering. If `found` is false, ask before creating a directory (`suggestedDir`, usually `docs/adr/`) and use `templates/adr-madr.md`, or `templates/adr-nygard.md` if the user prefers.
3. **Draft** it from what was actually discussed, with status `proposed` unless the user says it is agreed. Show the complete draft.
4. **Write** the file at `next.path` only after the user's yes. Don't commit or push it. When an ADR replaces an older one, change the old one's status line only after a separate yes.
5. **Report** number, title, status, path and `url` (the link works once the ADR is merged).

If the user gave no reason for the choice, ask for it in one line. An ADR without a reason is worth little.
