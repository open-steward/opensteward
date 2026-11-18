# Rocketlane adapter

Rocketlane REST API → canonical projects schema.

API key auth (`api-key` header). Key generated from Profile → Settings → API → Create API key.

No OAuth2 flow. No signed webhook delivery documented.

## Model notes

- Projects map directly from the `/projects` endpoint. `customerId` is surfaced as `workspaceId`.
- Tasks are fetched from `/tasks?projectId.eq={id}`. Parent tasks map to `Task.parentId`.
- Comments: `listComments(taskId)` reads the task's project from `/tasks/{id}`, then lists `/comments?projectId.eq={pid}&sourceType=TASK` and keeps the rows whose `source.sourceId` is the task (the API has no task filter). `getComment` reads `/comments/{id}`.
- Users are account-global; `workspaceIds` is always empty.
- Tags: no standalone tag resource in Rocketlane → not implemented (auto-501).
- Workspaces: no workspace concept → not implemented (auto-501).
- Webhooks: not documented in the public API → not implemented.

Refused: attachment content, time-tracking, user PII beyond name+email.
