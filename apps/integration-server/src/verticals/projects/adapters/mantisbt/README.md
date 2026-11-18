# MantisBT adapter

MantisBT REST API → canonical projects schema.

Self-hosted bug tracker. API token auth (raw `Authorization` header, no "Bearer" prefix).
The instance host URL is stored in `credentials.extra.host`.

## Supported resources

| Canonical  | MantisBT endpoint                            |
|-----------|----------------------------------------------|
| Projects  | `GET /projects`, `GET /projects/{id}`        |
| Tasks     | `GET /issues?project_id=&page=&page_size=`, `GET /issues/{id}` |
| Comments  | `GET /issues/{id}/notes`                     |
| Tags      | Derived from issue `tags` arrays             |
| Users     | `GET /users/me`, `GET /users/{id}`           |

## Model notes

- MantisBT uses "issues" for tasks and "notes" for comments.
- No workspace concept — `workspaceId` is set to `'default'`.
- Pagination: `page` (1-based) + `page_size` query params.
- Tags have no standalone list endpoint; collected from issue payloads.
- `getComment` requires composite id `"{issueId}:{noteId}"`.
- No webhook signature mechanism is documented; `verifyWebhook` / `parseWebhookEvents` are not implemented.

Refused: attachment content, time-tracking, user PII beyond name+email.
