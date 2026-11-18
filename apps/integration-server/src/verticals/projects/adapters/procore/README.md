# Procore adapter

Procore REST API (`/rest/v1.0`) → canonical projects schema. Construction project management.

OAuth2 authorization-code grant. `PROCORE_CLIENT_ID` / `PROCORE_CLIENT_SECRET`. Access tokens expire after 1.5h; refreshed via `refresh_token` (both code exchange and refresh require the registered `redirect_uri`).

## Model notes

- **Workspace ← Company** (`GET /companies`). Top-level Procore tenant; projects/users/RFIs scope beneath it.
- **Project ← Project** (`GET /projects?company_id=…`). `company_id` is supplied via `params.workspace_id`. Status derives from `project_stage` + `active`.
- **Task ← RFI** (`GET /projects/{project_id}/rfis`). Closest project-scoped unit of work. RFIs are flat — no parent pointer. Status: open/draft → open/in_progress, closed → closed.
- **User ← Company user** (`GET /companies/{company_id}/users`).
- **Comment ← RFI reply** (`GET /projects/{project_id}/rfis/{rfi_id}/replies`). The RFI is the task id; the project comes from `params.project_id`. Ids are `projectId:rfiId:replyId` so `getComment` (Show RFI Reply) can read them back.

Every call except List Companies sends the `Procore-Company-Id` header (https://developers.procore.com/documentation/tutorial-mpz). `listUsers` and `listProjects` send the company they name; `listTasks`, `getProject`, `listComments` and `getComment` need the connection's `credentials.extra.companyId` and refuse with a 501 without it.

Pagination: `page` (1-based) + `per_page`; next page read from the `Link` response header.

## Not implemented

- `getTask` / `getUser` — Procore RFI/user show endpoints require a parent id (project/company) the canonical single-id getter doesn't carry → auto-501.
- Tags — no first-class Procore equivalent in this vertical.
- Webhooks — Procore deliveries are unsigned thin notifications (`resource_name`/`resource_id`/`event_type`) with no documented signature, so no verification is implemented.

Refused: attachment content, time-tracking, user PII beyond name+email, custom-field schemas.
