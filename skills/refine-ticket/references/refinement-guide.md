# Refinement guide

Read this in step 2 of the workflow. It defines when a ticket is ready, what to look for in each of the three areas, how to write the questions, and how the refined ticket is laid out.

## Ready to implement

A ticket is ready when someone who did not take part in the refinement could start on it without asking anything that the ticket, the code or the ADRs could have answered.

- The goal and the value are stated.
- **Scope**: what is in and what is out is explicit, and it does not overlap with neighbouring tickets.
- **Domain rules** are explicit, including the edge cases and the error cases.
- **Acceptance criteria** are testable statements, not intentions.
- **Technical approach**: where the change goes, which components it touches, what changes in data and interfaces, how it is tested, and it agrees with the ADRs.
- Dependencies and risks are named.
- It fits into one iteration. If not, it is split into linked stories that each do (see "Splitting a ticket that is too big").
- What is still open is short, has an owner, and does not block the start.

## The three areas

For each topic: what to look for in the codebase and the ADRs first, and when only the user can answer.

### Scope (Abgrenzung)

| Topic | Look in the code, ADRs and ticket | Ask when |
|---|---|---|
| What is in, what is out | The ticket text, and what the code already does in this area. | The boundary could reasonably be drawn in two places. Offer both. |
| Neighbouring features and tickets | Similar features, code that already covers part of this, links in the ticket. | Two pieces of work overlap and nobody decided who does what. |
| Dependencies | Imports, other services or processes called from this area, deployment config. | Another team or an external system is involved. |
| Size and split | Number of components and layers the change would touch. | The ticket is too big for one iteration. Propose the split, let the user decide (see "Splitting a ticket that is too big"). |
| Non-goals | Not in the code. | Something looks implied by the ticket but was not asked for. |

### Domain rules (Fachlichkeit)

| Topic | Look in the code, ADRs and ticket | Ask when |
|---|---|---|
| Actors and roles | Roles and permissions in the code, docs, existing user stories. | It is unclear who triggers or receives something. |
| Trigger and preconditions | Process models (BPMN), state machines, event handlers, schedulers, API entry points. | The trigger point has several candidates, such as different end events. |
| Rules and calculations | Existing validation, domain services, constants, configuration. | The rule is in neither code nor docs. |
| Lifecycle and states | State enums, process definitions, database status columns. | A new state or transition is needed. |
| Edge and error cases | Error handling next to similar code, tests of neighbouring features. | The business consequence of a failure is not obvious (retry, escalate, skip). |
| Data | Entities, schemas, migrations, retention or privacy notes. | New personal data is stored or sent, or retention is unclear. |
| Legal, compliance, wording | Docs, texts and templates already in the repository. | Always, when a legal text or deadline is involved. These are never in code. |
| Acceptance | Derived from the rules above, in the style of the existing tests. | A criterion depends on a rule that is still undecided. |

### Technical approach (technische Umsetzung)

| Topic | Look in the code, ADRs and ticket | Ask when |
|---|---|---|
| Where it plugs in | Extension points and similar implemented features. | Several places fit. Offer them with the consequence of each. |
| Existing patterns | How comparable features are built: layering, naming, error handling. | The new work doesn't fit the existing pattern. |
| Data and contracts | Schemas, migrations, API specs, message definitions. | A change would break a consumer or needs a migration. |
| Integration | Clients, adapters and queues already in use. | A new external system or a new way to talk to an existing one is needed. |
| Transactions, retries, idempotency | How neighbouring code handles failure and repeated delivery. | The behavior on partial failure is a business question. |
| Non-functional needs | Config, SLAs in docs, observability setup, security rules. | Volume, latency or security needs are not stated and matter. |
| Testing | Existing test layers and tools. | There is no precedent for testing this kind of change. |
| Rollout | Feature flags, migration scripts, deployment config. | The change must be switched on gradually or needs data migrated. |
| ADR consistency | The ADRs matched in step 3. | The ticket conflicts with an ADR, or no ADR covers a decision that is now being made. |

## Splitting a ticket that is too big

Check the size in step 2 and again after the answers in step 4, because answers often add scope. Propose a split when two or more of these hold:

- The acceptance criteria fall into groups that could ship and be tested on their own.
- The ticket joins several workflow steps, actors, rule variants, data types, channels or platforms.
- The change touches several components and layers, and the sizing would not fit in one iteration (the team's own rule of thumb wins, otherwise a few days of work for one person).
- There are more than about eight acceptance criteria, or the title needs an "and".
- One part carries a big unknown (new integration, unclear rule) that would block the rest.

If only one signal holds, mention it and leave the ticket whole. Do not split a ticket just because it is long.

### How to cut

Cut **vertically**: every story delivers a visible result that can be built, tested and accepted alone. Cutting by layer ("database", "API", "UI") or by activity ("write tests") yields stories nobody can accept; don't.

Look for the cut in this order, and use the first that gives pieces of similar size:

| Cut by | Example |
|---|---|
| Workflow step | request, approve, notify |
| Simple case first | one document type, then the other types; fixed value, then configurable |
| Business-rule variant | standard case, then each special rule (discount, exemption) |
| Operation | create, then change, then delete |
| Data, channel or platform | one source or channel first, then the rest |
| Happy path, then edge and error cases | only where the edge cases are big on their own |
| Spike first | a time-boxed investigation story, when a decision must come before the build |
| Quality attribute later | performance, bulk volume or hardening after the basic function works |

The first story should be a thin end-to-end slice (a "walking skeleton") so the integration risk is gone early. Order the stories by dependency and say which one needs which.

### What each story gets

- A title that states an outcome, and a one-line goal with its value.
- The acceptance criteria that belong to it. Every criterion of the original ticket lands in exactly one story; none gets lost, none is duplicated.
- Its own scope in and out. Name what the sibling stories cover.
- Domain rules, technical approach and code pointers for its slice only.
- The ADRs it follows. Decisions that hold for all stories live in the parent and the ADRs; the stories refer to them.
- Dependencies: "needs" on the stories before it.

Aim for two to five stories. More means the cut is too fine, or the original ticket is really an epic and the first split should be into a few themes.

### The parent

The original ticket stays and becomes the umbrella: the shared goal and value, rules and decisions that hold for all stories (with ADRs), what is out of scope overall, and a list of the stories in order, each with its reference and a one-line goal. It has no acceptance criteria of its own beyond "all stories done". It is closed when its stories are. Its type, labels, assignees and state are left as they are.

### How to propose it

Put the proposal in the Scope questions of step 4 as the first question. Show a table (order, working title, goal, criteria it takes, depends on), say which cut you used and why, name the alternative cut if there is one, and recommend. The user can accept it, move criteria between stories, merge or add stories, or keep the ticket whole. If they keep it whole, record in the ticket why it stays one piece. Nothing is created before they agree.

## Writing the questions

Open with what you found, then ask only what is left. Each question is concrete, built on a finding, and answerable in a sentence or a pick from options. File, class and process names below are made-up examples.

| Instead of | Ask |
|---|---|
| "Can you explain the business logic?" | "`cancel.bpmn` ends in `Cancelled` and `CancelledLate`. Should the customer letter go out in both cases?" |
| "How should we implement this?" | "Two fits: an `ExternalTask` worker like `InvoiceWorker`, or a `JavaDelegate` like `MailDelegate`. ADR-0004 prefers workers for anything that calls an external system. I recommend the worker. Agree?" |
| "What about errors?" | "`MailDelegate` retries 3 times and then opens an incident. Should a failed letter do the same, or notify the case worker instead?" |
| "Is this in scope?" | "The ticket mentions the refund. `RefundService` already exists and is not touched by this change. Is the refund out of scope?" |

When you recommend an option, give the reason in a few words. When an ADR applies, name it by number and title instead of asking.

If the ticket conflicts with an ADR, say so plainly and offer the ways out: adapt the ticket to the ADR, or supersede the ADR with a new one (the new ADR is then written in step 5).

## The refined ticket

Keep the sections of the template the ticket came from, sharpen their content, and add what is missing from this list. Headings are in the ticket's language.

```markdown
# <Title, sharpened if needed>

## <the original template sections: problem, solution, steps ... >

## Scope
In: ...
Out: ...

## Business rules
- Rule, including edge and error cases.

## Acceptance criteria
- [ ] Testable statement.

## Technical approach
How it is built, where it plugs in (`path/to/File.java`, `process/flow.bpmn`),
data and interface changes, how it is tested, rollout.

## Decisions and ADRs
- ADR-0006 Use RabbitMQ for order events (proposed): `docs/adr/0006-use-rabbitmq.md`
- Follows ADR-0004 (accepted): external calls run in External Task workers.

## Dependencies and risks
- ...

## Open questions
- Question, and who can answer it.
```

Drop sections that would stay empty. Mark inferences as "Assumption: ...".

When the ticket is split, the parent is written as the umbrella described above and every story as a ticket of its own. Each story starts with "Part of <parent reference>" and otherwise uses the layout above, with its own scope and criteria. The parent's story list becomes a task list with the references of the created stories, in dependency order:

```markdown
## Stories
- [ ] #43 Export a single report as CSV
- [ ] #44 Export several reports as ZIP (needs #43)
```
