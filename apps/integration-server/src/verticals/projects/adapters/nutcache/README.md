# Nutcache adapter

Nutcache REST API → canonical projects schema.

Auth: `nut-basic` scheme — Base64(`publicKey:username:password`) sent as Authorization header;
`OrganizationGuid` header required for org-scoped calls.

Docs: https://nutcache.github.io/apidocs/

## Implemented resources

| Resource | Canonical type | Notes |
|---|---|---|
| Organizations | `Workspace` | Top-level billing org |
| Projects | `Project` | Status codes 0-4 mapped |
| Project members | `User` | Scoped to a project |

## Unsupported resources

The public Nutcache REST API does **not** expose tasks, comments, or tags as REST
endpoints — no `transform/task.ts`, `transform/comment.ts`, or `transform/tag.ts`
files exist for this reason. `listTasks`, `listComments`, and `listTags` are
intentionally absent from `index.ts`.

Refused: attachment content, time-tracking, user PII beyond name+email.
