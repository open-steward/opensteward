# Zammad adapter

Customer-support vertical adapter for Zammad (self-hosted open-source helpdesk).

Auth: API token — `Authorization: Token token=<value>` header.
The caller supplies the instance base URL via `credentials.extra.baseUrl`
(e.g. `https://support.example.com`).

Pagination: `?page={n}&per_page={size}` on all list endpoints.

Webhook: HMAC-SHA1 over raw request body; header `x-hub-signature`.
Configure the "Signature Token" on the Zammad webhook settings page.

## Resources

| Resource | Zammad endpoint |
|---|---|
| Tickets | `/api/v1/tickets` |
| Messages | `/api/v1/ticket_articles/by_ticket/{id}` |
| Contacts | `/api/v1/users` (Customer role) |
| Users (agents) | `/api/v1/users` (Agent role) |
| Tags | `/api/v1/tag_list` |
| Teams | `/api/v1/groups` |
| Macros | `/api/v1/text_modules` |

## Refused
- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- Contact PII beyond email + name + phone
