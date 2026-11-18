# Process Street adapter

Process Street public API v1.1 → canonical projects schema.

- Docs: https://public-api.process.st/api/v1.1/docs/index.html (OpenAPI at `/api/v1.1/docs/openapi.json`)
- Base URL: `https://public-api.process.st/api/v1.1`
- Auth: API key in the `X-API-Key` header.

## Model

| Process Street | Canonical | Endpoint |
|---|---|---|
| Workflow | Project | `GET /workflows`, `GET /workflows/{workflowId}` |
| Task of a Workflow Run | Task | `GET /workflow-runs/list?workflowId=…` then `GET /workflow-runs/{workflowRunId}/tasks` |
| User | User | `GET /users` (no by-id path: `getUser` refuses with 501) |

A task id is `<workflowRunId>:<taskId>`, because a task is read back from
`GET /workflow-runs/{workflowRunId}/tasks/{taskId}`.

## Paging

Every list returns 20 rows at a time and pages by the opaque `_` cursor taken
from the `links[]` entry named `next`; its absence ends the list. There is no
page-size parameter, so every list is cut to the caller's page with `pageByRows`.
