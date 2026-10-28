# Gathering information for a ticket

Read this in step 3 of the workflow. It says what each template needs, where the repository usually holds it, and when only the user can answer. The rule behind all of it: **what the repository states, you don't ask; what only the user knows, you ask precisely; what is neither, you leave as an open question.**

## What each bundled template needs

### bug

| Fact | Look in the repository | Ask the user when |
|---|---|---|
| Symptom | The user's description and any pasted logs. Search the code for the error text to find where it is raised. | The symptom itself is unclear. |
| Expected behavior | Tests, docs, API specs, comments and names around the code involved. | Specs conflict, or nothing describes it. |
| Steps to reproduce | Existing tests for the area. Follow the code path from the entry point (route, command, job) to the failure. | The steps can't be derived from code and logs. |
| Environment and version | Dependency manifests and lock files, `git describe --tags`, CI config, `Dockerfile`, `.tool-versions`. | The problem depends on the user's runtime (OS, browser, production or local). |
| Technical context | The code where the error is raised, and `git log -5 -- <path>` for recent changes there. | Never. State a suspected cause only if the code makes it evident. |
| Impact | Not in the repository. | Always, unless the user already said. |

### feature

| Fact | Look in the repository | Ask the user when |
|---|---|---|
| Who needs it, and why | README, docs, existing user stories or tickets, similar features. | It is not clear for whom this is. |
| Trigger and conditions | Domain models and flows: BPMN files, state machines, event handlers, schemas, migrations. Handlers for neighbouring events. | The business rule is in neither code nor docs. |
| Expected result | Analogous behavior that exists already (for example other notifications or exports). | The user's intent differs from the analogue you found. |
| Where it plugs in | Extension points, similar implemented features, module boundaries, naming conventions. | Several places fit. Offer them as options. |
| Constraints | Architecture docs and ADRs, compliance notes, versions of the frameworks in use. | Legal or business constraints that matter. These are never in code. |
| Acceptance criteria | Derive them from the facts above and follow the style of existing tests. | They depend on a decision nobody has made yet. |
| Out of scope | Not in the repository. | The boundary to neighbouring work is unclear. |

### task

| Fact | Look in the repository | Ask the user when |
|---|---|---|
| Goal and reason | A linked TODO or issue, commit messages, docs. | It is not clear why the work is needed. |
| Scope and affected parts | Usages (search for the symbol), module boundaries, the file list. | The scope has no natural boundary. |
| Dependencies and order | Imports, build files, related tickets or docs. | Another team or an external system is involved. |
| Definition of done | Test, lint and build commands in the README, `Makefile` or CI config. | Done depends on someone's approval or decision. |

### Custom templates

Turn every section and every hint comment into a fact, then handle it like the rows above: look in the repository, ask only when it's not there.

## Where to look

- **The user's words.** Search for names, routes, error strings and domain terms. Try synonyms and the other language if the code base mixes them.
- **Docs.** `README`, `docs/`, ADRs, `CHANGELOG`, `CLAUDE.md` or `AGENTS.md`, `CONTRIBUTING`. Existing templates in `.github/ISSUE_TEMPLATE/` or `.tickets/` show how this project writes tickets.
- **Domain artifacts.** `*.bpmn` and `*.dmn`, OpenAPI files, database migrations, state machines, message or event definitions, feature flags.
- **Tests.** They state expected behavior and often show reproduction steps.
- **History.** `git log --oneline -S"<term>"` and `git log --grep="<term>"` show when and why something appeared. `git blame` on the relevant lines helps for bugs.
- **Versions.** `package.json`, `pom.xml`, `build.gradle`, `pyproject.toml`, `go.mod`, lock files, `git describe --tags`, CI config.
- **Loose ends.** `TODO` and `FIXME` comments near the code involved.

Keep searches targeted. If three focused searches find nothing, stop and treat the fact as missing. Do not open `.env`, key files or credential stores.

## Found, ambiguous or missing

| The repository shows... | Treat as | Do |
|---|---|---|
| The fact stated plainly | found | Use it. Don't ask. |
| One plausible answer that you had to infer | found, as an assumption | Use it and mark it "Assumption:" in the draft. |
| Several candidates, or conflicting sources | ambiguous | Ask, with the candidates as options. |
| Nothing | missing | Ask if only the user can know it. Otherwise list it as an open question. |

## Writing the questions

Open with what you found, then ask only what is left. Every question is concrete, is built on a finding, and can be answered in a sentence. The file and class names below are made-up examples.

| Instead of | Ask |
|---|---|
| "Can you tell me more about the feature?" | "`process/cancel.bpmn` ends in `Cancelled` and `CancelledLate`. Should the letter go out in both cases?" |
| "Which framework version do you use?" | Nothing. `pom.xml` states it. Use it. |
| "What should happen if sending fails?" | "`MailService` retries three times and then raises an incident. Should the letter follow the same rule?" |
| "How important is this?" | "Who is affected, and is there a workaround?" (impact is never in the repository) |

At most five questions in one round, most important first. Group them in a single message. One short follow-up round is allowed if the answers open a real new gap. Anything still unanswered becomes an open question in the ticket.
