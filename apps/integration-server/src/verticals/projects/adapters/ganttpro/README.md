# GanttPRO adapter

GanttPRO REST API → canonical projects schema.

Auth: API key via `X-API-KEY` header. Generate keys at https://app.ganttpro.com/#/settings/integrations (team owner required).

Base URL: `https://api.ganttpro.com/v1.0`

## Supported resources

- Projects (`GET /projects`, `GET /projects/{id}`)
- Tasks (`GET /tasks?projectId=X`, `GET /tasks/{id}`)
- Comments (`GET /comments?taskId=X`)
- Workspaces — mapped from `GET /team` (single team object)
- Users (`GET /users`, `GET /users/{id}`)

## Not supported

- Tags — no labels/tags endpoint in GanttPRO API
- Webhook signature verification — not documented by GanttPRO
- Pagination — API returns full result sets

## Model notes

- Task statuses: 1=Open → `open`, 2=In progress → `in_progress`, 3=Done / 4=Closed → `closed`
- Task priorities: 1–2=Lowest/Low → `low`, 3=Medium → `medium`, 4=High → `high`, 5=Highest → `urgent`
- `ownerId` on a task maps to `assigneeIds[0]`
- Parent tasks use `parent` field (numeric id)
- Team object → single canonical Workspace
