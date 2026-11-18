# Float adapter

Float REST API (`https://api.float.com/v3`) → canonical projects schema. Float is a resource-scheduling platform.

API-key (bearer token) + REST. No OAuth — credentials collected via the Connect Link form (`simpleApiKey`): a single Float access token from Account Settings → Integrations. Every request also sends the Float-required `User-Agent`.

Pagination: 1-based `page` + `per-page` (max 200).

## Model notes

- **Workspaces → Clients** (`/clients`). Float has no workspace concept; clients are the top-level grouping that owns projects (`project.client_id`).
- **Tasks → Project Tasks** (`/project-tasks`, filtered by `project_id`). These are Float's named task-list definitions (not scheduled allocations). Canonical task id is the composite `{projectId}:{taskId}`; a task's `phase_id` is surfaced as `Task.parentId`.
- **Users → People** (`/people`). `job_title`, `department`, and tags ride in metadata.
- **Projects** (`/projects`). `active: 0` → `archived`, else `active`. Color, project_code, status flags, and tags ride in metadata.

Not implemented (auto-501):

- **Comments** — Float has no comment/discussion concept.
- **Tags** — inline string arrays on projects/people, not a standalone listable resource (surfaced in metadata).
- **Webhooks** — Float v3 exposes no signed webhook delivery.

Refused: attachment content, time-tracking, budgets/rates, user PII beyond name+email.
