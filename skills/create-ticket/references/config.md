# Configuration

The skill looks for `config.json` in two places and uses the first one it finds. The files are not merged.

1. `.tickets/config.json` in the project. The skill walks up from the working directory, so it also works from a subfolder.
2. `~/.config/ticket-skill/config.json` for every project (`$XDG_CONFIG_HOME` and `$TICKET_SKILL_HOME` are honoured).

With neither file the skill only drafts tickets. The file holds **names of environment variables, never secrets**, so it is safe to commit.

## Common fields

| Field | Required | Meaning |
|---|---|---|
| `provider` | yes | `"github"`, `"gitlab"` or `"jira"`. Only the settings block of this provider is read. |
| `autoCreate` | no | `true` skips the confirmation question. Default `false`. Creating a ticket is visible to others, so leave it off unless you want that. |
| `defaultTemplate` | no | Template used when the request doesn't point to one, e.g. `"task"`. |

All URLs must use `https`. Plain `http` is accepted only for `localhost`, so tokens never travel unencrypted.

## GitHub

```json
{
  "provider": "github",
  "github": { "repo": "acme/app" }
}
```

| Field | Default | Meaning |
|---|---|---|
| `repo` | required | `owner/name` |
| `tokenEnv` | `GITHUB_TOKEN`, then `GH_TOKEN` | Variable that holds the token |
| `apiUrl` | `https://api.github.com` | For GitHub Enterprise Server use `https://HOST/api/v3` |

Token: a fine-grained personal access token with **Issues: Read and write** on the repository, or a classic token with the `repo` scope (`public_repo` for public repositories). Labels and assignees from the draft are sent as they are. GitHub silently drops both when the token has no push access to the repository, so a ticket can be created without them.

## GitLab

```json
{
  "provider": "gitlab",
  "gitlab": { "project": "group/subgroup/app" }
}
```

| Field | Default | Meaning |
|---|---|---|
| `project` | required | Project path or numeric id |
| `baseUrl` | `https://gitlab.com` | Your instance for self-managed GitLab |
| `tokenEnv` | `GITLAB_TOKEN` | Variable that holds the token |

Token: a personal or project access token with the `api` scope, for a user or bot that is allowed to create issues in the project. GitLab needs numeric user ids for assignees, so the skill ignores `assignees` and says so in `warnings`.

## Jira

```json
{
  "provider": "jira",
  "jira": {
    "baseUrl": "https://acme.atlassian.net",
    "projectKey": "ABC",
    "defaultIssueType": "Task"
  }
}
```

| Field | Default | Meaning |
|---|---|---|
| `baseUrl` | required | Site URL without a trailing path |
| `projectKey` | required | e.g. `ABC` |
| `defaultIssueType` | `Task` | Used when the draft has no `type` |
| `auth` | `basic` | `basic` for Jira Cloud, `bearer` for Data Center or Server personal access tokens |
| `emailEnv` | `JIRA_EMAIL` | Variable with your Atlassian account email (`basic` only) |
| `tokenEnv` | `JIRA_API_TOKEN` | Variable that holds the token |

Jira Cloud: create an API token at <https://id.atlassian.com/manage-profile/security/api-tokens> and export your account email as `JIRA_EMAIL`. Data Center: create a personal access token in your profile, set `"auth": "bearer"` and skip the email.

The skill talks to REST API v2, which Cloud and Data Center both serve. The Markdown of the draft is converted to Jira wiki markup. The issue type comes from the draft's `type` (the bundled templates use `Bug`, `Story` and `Task`). If your project has other types, for example a business project with only `Task`, set `type` in your own template or the draft. Jira's error response names the field it rejected. Jira needs account ids for assignees, so `assignees` are ignored with a warning.

## Setting the environment variables

Set the variable in the shell or environment that starts the agent, for example in `~/.zshrc`:

```bash
export GITHUB_TOKEN=...      # or GITLAB_TOKEN, or JIRA_EMAIL + JIRA_API_TOKEN
```

`check` shows which variables are set without ever printing their values.
