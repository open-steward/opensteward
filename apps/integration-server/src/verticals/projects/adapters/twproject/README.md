# Twproject adapter

Twproject self-hosted REST API (V1) → canonical projects schema.
Docs: https://twproject.com/support/api-documentation/ (command/object reference embedded in the page; response examples at https://twproject.com/support/api/returnSamples.json).

**Auth**: the common request parameter `APIKey` in the JSON POST body. The Connect Link form collects the server URL (`credentials.extra.serverUrl`) and the API key (`accessToken`); every call posts to `<serverUrl>/API/V1/`.

## Model

- Projects ← `list` of `task` with `filters: { isProject: true }`; `getProject` ← `get` of `task`.
- Tasks ← `list` of `task` with `filters: { subtaskOfAncestorId }` (every task below the project).
- Users ← `list` / `get` of `person` (`displayName`, `email`).
- Paging: `pageSize` + `page` (1-based); the response's `hasMore` is reported as the end signal.
- Dates: the epoch-millisecond `start`, `end`, `creationDate`, `lastModified`.
- Status: `taskStatusType` (STATUS_ACTIVE, STATUS_SUSPENDED, STATUS_DONE, …); values with no canonical counterpart map to `unknown`, the raw value is kept in `metadata.status`.

## Refused (501 NOT_SUPPORTED, no request)

- Comments: no comment object; issue comments can only be added (`addComment`).
- Workspaces: no workspace object; each server is one tenant.
- `getTask`: no documented task response field carries a parent or project (`parentId` is documented only in the create/update `data` input and is absent from every `get`/`list` response sample), so the required `projectId` is only known from `listTasks`.
- Tags: no tag object.
