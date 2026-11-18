# Yandex Tracker adapter

Yandex Tracker REST API v3 → canonical projects schema.

OAuth2 + REST. `YANDEX_TRACKER_CLIENT_ID` / `YANDEX_TRACKER_CLIENT_SECRET`.
Auth header: `Authorization: OAuth <token>`.
Org header: `X-Org-ID` (Yandex 360 numeric org) or `X-Cloud-Org-Id` (Yandex Cloud org).

No webhook signature documentation found for Yandex Tracker — webhook.ts omitted.

## Model notes

- Queues (`/v3/queues`) → canonical `Workspace`.
- Projects (`/v3/projects`) → canonical `Project`.
- Issues (`/v3/issues/_search`, `/v3/issues/{id}`) → canonical `Task`.
  - `issue.deadline` → `Task.dueDate`.
  - `issue.parent` → `Task.parentId` (subtask pointer).
  - `issue.status.key` mapped to `open` / `in_progress` / `closed`.
  - `issue.priority.key` mapped to `urgent` / `high` / `medium` / `low`.
- Comments (`/v3/issues/{issueId}/comments`) → canonical `Comment`.
- Tags are plain `string[]` on issues; deduplicated per-queue into canonical `Tag` objects.
- Users (`/v3/users`) → canonical `User`.

Pagination: `perPage` + `page` query/body params; `X-Total-Pages` / `X-Total-Count` response headers.

Refused: attachment content, time-tracking, user PII beyond name+email.
