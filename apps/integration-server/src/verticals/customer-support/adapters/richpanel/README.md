# Richpanel adapter

Customer-support vertical adapter for Richpanel.

Auth: API key via `x-richpanel-key` header. Key generated in Settings → Integrations → API Keys.
Base URL: `https://api.richpanel.com`
Pagination: none documented. `GET /v1/users`, `/v1/tags`, `/v1/teams` and `GET /v1/tickets/{id}` (comments) take no paging parameters and return the whole collection, so the adapter pages them locally.
Rate limit: 100 req/min; 492 (custom) or 429 status when exceeded.

## Supported resources

- Tickets: `GET /v1/tickets/{id}` only. listTickets is refused (501 NOT_SUPPORTED): the API documents no conversation list, only lookups by id, conversation number or customer email/phone.
- Messages / comments: embedded in the ticket object (`ticket.comments`); fetched via `GET /v1/tickets/{id}?include_private_notes=true`
- Contacts / customers: lookup by email via `GET /v1/customers/email/{email}`. listContacts is refused (501 NOT_SUPPORTED): no customer list is documented.
- Users / agents (`/v1/users`, `/v1/users/{id}`)
- Teams: `GET /v1/teams` (`{ "team": [...] }`). No GET-by-id is documented; getTeam reads the team back from the list.
- Tags: `GET /v1/tags` (`{ "tag": [...] }`), keyed by tag `id`. getTag reads the tag back from the list.

## Not supported

- Macros / canned responses (feature not available in Richpanel)
- Webhook signature verification (no documented signing secret mechanism)

## Schema firewall

- No attachment content (only attachmentCount where present)
- No voice/call recording audio or transcripts
- Contact PII limited to email, name, phone
