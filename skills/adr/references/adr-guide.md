# Writing ADRs

Read this before recording a decision. An ADR (Architecture Decision Record) is a short document that says what was decided, why, and what follows from it. It exists so that nobody has to ask "why is it built like this?" a year later.

## When a decision needs an ADR

Write one when the decision:

- is hard or expensive to reverse,
- sets or changes structure, technology, an integration pattern, a data model or a cross-cutting rule (security, error handling, transactions),
- was made between real alternatives, and someone will want to know why the others lost,
- or deviates from an existing ADR.

Don't write one for:

- details that only concern one change (a method name, a field label),
- what an existing ADR already decides: reference it,
- a choice nobody would question or that is trivial to change later.

When unsure, ask: "Would a new team member need this explained?" If yes, write it. One piece of work usually yields zero or one ADR, rarely more.

## The project's own conventions come first

`list` reports what the project does: the directory, the `format` (`madr` or `nygard`), the number width, whether file names carry an `adr-` prefix, and the `next` file name and path for a given `--title`. Follow all of it. Don't impose a different format or numbering on a project that has one. Write in the language of the existing ADRs, or in the user's language if there are none.

If the project has no ADRs:

1. Tell the user there is no ADR directory and suggest `docs/adr/` (the `suggestedDir` in the result).
2. Create it only after their yes.
3. Use `templates/adr-madr.md` unless they prefer `templates/adr-nygard.md`.

## What goes in the ADR

Take the content from the conversation and the code, not from imagination.

- **Title**: the decision as a statement ("Use RabbitMQ for order events"), not the topic ("Messaging").
- **Context**: the problem and the forces behind it. Name where it came up (ticket id and URL, if there is one).
- **Considered options**: the options that were actually discussed, each with its pros and cons.
- **Decision**: the chosen option and the reason the user gave. If they gave none, ask instead of writing a reason yourself.
- **Consequences**: what gets easier, what gets harder, what must follow (migration, new ADRs, tickets). Take them from the code and the other ADRs.
- **Status**: `proposed`, unless the user says it is already agreed. Statuses used are `proposed`, `accepted`, `rejected`, `deprecated` and `superseded by ADR-NNNN`.

Keep it short. A good ADR fits on one screen.

## Writing it

1. Run `list --title "<title>"` and use `next.path`.
2. Show the full draft and ask for a yes.
3. Write the file at that path. Don't commit it and don't push it.
4. Give the caller number, title, status and the repository path, plus the `url` from `list` when there is one (the link works once the ADR is merged), so it can reference the ADR, for example from a ticket.
5. If the decision came up in a ticket, name it in the ADR so the link runs both ways.

## Superseding and changing

- Never rewrite the content of an accepted ADR. A changed decision gets a new ADR that says "Supersedes ADR-NNNN".
- Changing the old ADR's status to "Superseded by ADR-NNNN" is the one edit allowed, and only after the user confirms it separately.
- If the work conflicts with an ADR, the way out is either to adapt the work or to supersede the ADR. Don't quietly ignore the ADR.
