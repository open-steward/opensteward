# Deskpro adapter

Customer-support vertical adapter for [Deskpro](https://www.deskpro.com/).

Per-customer instance URL (e.g. `https://acme.deskpro.com`). API key auth —
`Authorization: key <id>:<secret>`.

Credentials collected via `credentialFields()`:
- `instanceUrl` — the base URL of the helpdesk
- `apiKey` — API key in `<id>:<secret>` format

## Resources
- Tickets → GET /api/v2/tickets
- Messages → GET /api/v2/tickets/{id}/messages
- Contacts → GET /api/v2/people
- Agents (users) → GET /api/v2/agents
- Labels (tags) → GET /api/v2/ticket-labels
- Departments (teams) → GET /api/v2/departments
- Snippets (macros) → GET /api/v2/snippets

## Refused
- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- AI-suggested-reply fields
- Contact PII beyond email + name + phone
