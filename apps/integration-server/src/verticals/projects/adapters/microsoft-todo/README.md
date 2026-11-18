# Microsoft To Do adapter

Microsoft To Do (via the Microsoft Graph REST API, `https://graph.microsoft.com/v1.0`) → canonical projects schema.

OAuth2 (Microsoft identity platform v2.0, `common` tenant). Delegated scopes: `offline_access`, `User.Read`, `Tasks.Read`. Access token is a Bearer token on `Authorization`.

Webhook: Microsoft Graph change notifications for `todoTask` (worldwide endpoint only). No HMAC body signing — authenticity is verified by comparing the `clientState` carried in each notification against the shared secret.

## Model notes

- `todoTaskList` → `Project`. To Do has a single grouping level (lists), so the list is the task container. Built-in lists (`defaultList`, `flaggedEmails`) are surfaced alongside user lists; `wellknownListName` lands in metadata.
- `todoTask` → `Task`. No task hierarchy at the `todoTask` level, so `parentId` is never set. `status` maps `notStarted`/`deferred`→open, `inProgress`→in_progress, `waitingOnOthers`→in_review, `completed`→closed. `importance` (low/normal/high) → priority. Due/start/completed/reminder times come from Graph `dateTimeTimeZone` wrappers. Because Graph addresses a task only through its list, `Task.id` is the composite `{listId}:{taskId}` (round-trips through `getTask`); `externalId` keeps the raw Graph id.
- Synthetic single `Workspace` from `/me` (the mailbox) — To Do has no org tier above lists.

## Not supported (auto-501)

- Comments — To Do has no comment entity (checklistItems are subtasks, not comments).
- Tags — `categories` are free-text strings, not addressable entities; surfaced in task metadata.

## Partial support notes

- Users — no member directory is accessible under `Tasks.Read`. `listUsers` and `getUser` always return the single signed-in mailbox owner (`/me`), regardless of any `workspaceId` or `id` argument. The returned `User.id` matches the synthetic workspace id.

Refused: attachment content, time-tracking, user PII beyond name+email.
