# Ada CX adapter

Customer-support vertical adapter for Ada (https://ada.cx). Docs: https://docs.ada.cx/

Per-tenant host `https://<bot-handle>.ada.support`. API key auth via `Authorization: Bearer <key>`.

## Supported resources
- **Tickets** — Ada conversations.
  - List: Data Export API, `GET /api/v2/export/conversations`. It needs a date range of at most
    60 days and serves the past 12 months, so the list walks 60-day windows newest first, anchored
    to UTC midnight: `created_since`/`created_to` back to the 12-month lookback, or
    `updated_since`/`updated_to` from `updatedAfter`. Pages inside a window follow `meta.next_page_uri`.
  - Get: Conversations API, `GET /api/v2/conversations/{conversation_id}/`.
- **Messages** — Conversations API, `GET /api/v2/conversations/{conversation_id}/messages/`
  (`cursor` + `limit`, max 100).
- **Contacts** — End Users API, `GET /api/v2/end-users/` (`cursor` + `limit`) and
  `GET /api/v2/end-users/{end_user_id}`.

## Not supported (no public Ada API)
- Users (agents), Tags, Teams, Macros — auto-501 via interface optionality

## Refused (schema-firewall)
- Attachment content (a file message counts as one attachment)
- `inquiry_summary` (AI-generated) is not used as the ticket subject
- Contact PII beyond email and name; arbitrary `profile.metadata` keys are not read
