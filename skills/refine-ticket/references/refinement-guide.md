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
- It fits into one iteration. If not, the ticket says how to split it.
- What is still open is short, has an owner, and does not block the start.

## The three areas

For each topic: what to look for in the codebase and the ADRs first, and when only the user can answer.

### Scope (Abgrenzung)

| Topic | Look in the code, ADRs and ticket | Ask when |
|---|---|---|
| What is in, what is out | The ticket text, and what the code already does in this area. | The boundary could reasonably be drawn in two places. Offer both. |
| Neighbouring features and tickets | Similar features, code that already covers part of this, links in the ticket. | Two pieces of work overlap and nobody decided who does what. |
| Dependencies | Imports, other services or processes called from this area, deployment config. | Another team or an external system is involved. |
| Size and split | Number of components and layers the change would touch. | The ticket is too big for one iteration. Propose the split, let the user decide. |
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

Drop sections that would stay empty. Mark inferences as "Assumption: ...". If the ticket should be split, add a short list of the proposed sub-tickets with a one-line goal each. Writing the sub-tickets is a job for `create-ticket`.
