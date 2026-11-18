# Scoro adapter

Scoro API v2 → canonical projects schema. All-in-one business management platform.

Auth: static API key (`apiKey`) + `company_account_id` sent in every POST body. No OAuth flow.

Base URL: `https://{companyAccountId}.scoro.com/api/v2`

Webhook: Scoro does not publish HMAC signatures — `verifyWebhook` is a no-op stub. Restrict delivery via HTTPS + IP allowlist.

## Model notes

- Projects: `project_id` / `project_name`; status mapped from opaque slugs (defaults to `active`).
- Tasks: `event_id` / `event_name`; `priority_id` 1=high, 2=normal, 3=low; `is_completed` → `closed`.
- Subtasks: `parent_id` field; included via `include_subtasks=1` in list requests.
- Comments: queried per task via `module=tasks` + `object_id`.
- Tags: global list (`/tags/list`), not scoped to workspace.
- Workspaces: mapped from `/companyAccount/list` entities.
- Users: `/users/list`; `full_name` or `firstname`+`lastname` join → canonical `name`.

Refused: attachment content, time-tracking, user PII beyond name+email.
