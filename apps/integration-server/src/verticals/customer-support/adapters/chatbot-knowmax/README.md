# Knowmax adapter

Customer-support vertical adapter for the Knowmax knowledge management platform.

Per-tenant base URL: `https://app.knowmax.ai/{clientName}`
Auth: static Bearer token (generated at Admin > Company Settings > Generate Token).

Credentials: `clientName` (tenant slug) + `apiToken` (Bearer token).

## Resources implemented
- `listTickets` / `getTicket` ��� maps Knowmax Articles and FAQs
- `listTeams` / `getTeam`   — maps Knowmax Categories

## Resources not implemented (Knowmax has no equivalent)
- Contacts, Users, Tags, Messages, Macros — auto-501 via base interface

## Webhooks
No webhook delivery is documented in the Knowmax public API.

## Refused
- Article body HTML (content field not surfaced at schema level)
- Contact PII beyond email + name + phone
