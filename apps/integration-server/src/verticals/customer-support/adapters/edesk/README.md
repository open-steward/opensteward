# eDesk adapter

Customer-support vertical adapter for eDesk.

Auth: static API key passed as `Authorization: Bearer <key>`.
Base URL: `https://api.edesk.com/v1`
Docs: https://developers.edesk.com/reference

Supports: tickets, messages (scoped to ticket), contacts, users, tags.
No teams or macros endpoint available in eDesk — those methods auto-501.

Pagination: `page` + `itemsPerPage` query params; response envelope
`{ paginator: { totalItemsCount, currentPage, itemsPerPage }, data: [...] }`.

Webhooks: not publicly documented by eDesk — webhook methods omitted.

## Refused
- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- AI-generated summary/suggestion fields
- Contact PII beyond email + name + phone
