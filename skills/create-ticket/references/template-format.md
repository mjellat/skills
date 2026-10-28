# Template format

A template is a Markdown file named `<name>.md`. The file name is the template name.

```markdown
---
name: bug
description: Report a defect with reproduction steps
type: Bug
labels: [bug, needs-triage]
titlePrefix: "[Bug] "
---
# <!-- Title: what breaks and where. Replace this whole line. -->

## Summary
<!-- One or two sentences. -->

## Steps to reproduce
<!-- Numbered and minimal. -->
```

## Frontmatter

Flat `key: value` lines. Lists are written inline as `[a, b]`. Put a value in quotes if it starts with `[` or has leading or trailing spaces, as in `titlePrefix: "[Bug] "`. This is not full YAML.

| Key | Meaning |
|---|---|
| `name`, `description` | Shown by `templates`. `description` helps pick the right template. |
| `type` | Issue type. Used by Jira (`Bug`, `Story`, `Task`, ...). GitHub and GitLab ignore it. |
| `labels` | Labels to apply. Jira labels can't contain spaces, so spaces become `-`. |
| `assignees` | GitHub usernames. Ignored for Jira and GitLab. |
| `titlePrefix` | Added to the title unless the title already starts with it. |

The draft keeps this frontmatter, so what you set in a template is what gets sent unless the draft changes it.

## Body

- The ticket title is the first top-level heading (`# Title`) outside a code block. It is removed from the body.
- `<!-- comments -->` are hints for the agent. They are removed before the ticket is created.
- Everything else is sent as the description. GitHub and GitLab get the Markdown unchanged. Jira gets it converted to wiki markup (headings, bold, italic, inline code, code blocks, lists, task lists, links, quotes and simple tables).

## Where templates live

Highest priority first. A template with the same name shadows the ones below it.

1. `.tickets/templates/` in the project
2. `~/.config/ticket-skill/templates/`
3. `templates/` inside the skill (`bug`, `feature`, `task`)

To adapt a bundled template, copy it into the first folder and edit the copy. Edits to the bundled files are lost when the skill is updated.
