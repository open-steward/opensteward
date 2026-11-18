# Nextcloud Deck adapter

Nextcloud Deck REST API → canonical projects schema.

Auth: HTTP Basic Auth with a Nextcloud App Password (`api_key` model). No OAuth flow.

No documented webhook signature scheme; `verifyWebhook` always returns false.

## Model notes

- Boards → `Project`. The Nextcloud server itself is the single `Workspace`.
- Stacks (columns) are presentational; cards are flattened across all stacks when listing tasks.
- Cards → `Task`. Assignees map to `assigneeIds`; board labels assigned to the card map to `tagIds`.
- Board labels → `Tag`. `workspaceId` on a Tag is the board ID.
- Comments fetched via the OCS API (`/ocs/v2.php/apps/deck/api/v1.0/cards/{cardId}/comments`).
- `getTask` / `getTag` / `getUser` IDs use slash-separated compound keys: `<boardId>/<stackId>/<cardId>`.

Refused: attachment content, time-tracking, user PII beyond name+displayname.
