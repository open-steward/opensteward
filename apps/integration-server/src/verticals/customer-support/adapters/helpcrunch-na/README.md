# InvGate Service Management adapter

Customer-support vertical adapter for InvGate Service Management.

Per-tenant instance URL (e.g. `acme.cloud.invgate.net`). API token (Bearer) auth.

## Supported resources
- Tickets (incidents) — list/get via `/incidents.by.status` + `/incident`
- Messages (comments) — fetched inline with ticket via `?comments=true`
- Contacts (end-users) — `/users`
- Users (agents) — `/users`
- Tags (categories) — `/categories`
- Teams (groups / helpdesks) — `/groups`

## Not supported
- Macros — InvGate has no canned-response/macro feature
- Webhooks — no documented signature verification scheme

## Refused (schema-firewall)
- Attachment content (only attachmentCount surfaced)
- Contact PII beyond email + name + phone
