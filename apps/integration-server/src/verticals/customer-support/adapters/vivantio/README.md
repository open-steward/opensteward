# Vivantio adapter

Customer-support adapter for the Vivantio ITSM platform.

Auth: HTTP Basic (username + password base64-encoded).
Regional base URL configurable via `apiBaseUrl` credential field
(default: `https://webservices-na01.vivantio.com`).

API docs: https://webservices-na01.vivantio.com/Help

## Supported resources
- Tickets (`/api/Ticket/SelectPage`, `/api/Ticket/SelectById/{id}`)
- Messages/Actions (`/api/Ticket/ActionSelectByParentId/{ticketId}`)
- Contacts/Callers (`/api/Caller/SelectPage`, `/api/Caller/SelectById/{id}`)
- Users/Technicians (`/api/Configuration/UserSelectAll`, `/api/Configuration/UserSelectById/{id}`)
- Teams/Groups (`/api/Configuration/GroupSelectAll`)

## Not supported (no Vivantio equivalent)
- Tags — Vivantio has no standalone tagging endpoint
- Macros/canned responses — Vivantio has no equivalent feature

## Webhooks
Vivantio's outbound webhook payloads are fully user-configurable templates
with no documented HMAC signature scheme. `verifyWebhook` and
`parseWebhookEvents` are not implemented.

## Refused
- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- AI-suggested-reply fields
- Contact PII beyond email + name + phone
