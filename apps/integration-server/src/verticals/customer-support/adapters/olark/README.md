# Olark adapter

Customer-support vertical adapter for Olark live chat.

REST API base: `https://www.olark.com/api/v1`
Auth: API key passed as `apikey` query parameter on every request.
Pagination: integer `page` offset, max 100 records per page.

## Implemented resources
- **Users** (operators/agents) — `listUsers`, `getUser`
- **Teams** (groups) — `listTeams`, `getTeam`

## Not supported via REST API
Olark does not expose REST endpoints for tickets, contacts, messages, tags,
or macros. These methods are not implemented (auto-501).

Webhook: Olark sends conversation lifecycle events via HTTP POST but does
not document an HMAC signature scheme; `verifyWebhook` is not implemented.

## Refused (schema-firewall)
- Attachment content (only attachmentCount where applicable)
- Voice/call recording audio and transcripts
- AI-suggested-reply fields
- Contact PII beyond email + name + phone
