# DelightChat adapter

Customer-support vertical adapter for DelightChat — an omnichannel support &
WhatsApp marketing platform for e-commerce brands.

Auth: static API key via `X-API-KEY` header (obtained from the DelightChat dashboard).
Base URL: `https://api.delightchat.io`
Docs: https://api.delightchat.io/docs

## Supported resources

DelightChat's public API (as of 2025) exposes a single endpoint for sending
WhatsApp messages via automations (`POST /api/v1/public/message`). There are no
published read-only REST endpoints for conversations, contacts, users, tags,
teams, or macros; all resource methods return 501 Not Implemented.

### No transform files (ticket, message, contact, user)

`transform/ticket.ts`, `transform/message.ts`, `transform/contact.ts`, and
`transform/user.ts` are intentionally absent. DelightChat provides no read API
for these resource types, so there is nothing to transform. If DelightChat
publishes read endpoints in a future API version, add the transform files and
wire the methods into `index.ts` following the canonical customer-support
vertical patterns.

## Refused (schema-firewall)
- Attachment content (only attachmentCount if endpoints become available)
- Voice/call recording audio + transcripts
- AI-generated reply suggestions
- Contact PII beyond email + name + phone
