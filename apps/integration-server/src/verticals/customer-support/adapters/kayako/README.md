# Kayako adapter

Customer-support vertical adapter for [Kayako](https://www.kayako.com/).

Per-tenant subdomain (`<subdomain>.kayako.com`). Basic HTTP auth — email:password
encoded as Base64. REST API v1 (`/api/v1/`).

Credentials stored: `accessToken` = email, `extra.password` = password, `extra.subdomain` = subdomain.

Webhook: Kayako v1 does not publish a documented signature-verification scheme;
`verifyWebhook` / `parseWebhookEvents` are not implemented.

## Supported resources
- Tickets (cases): `listTickets`, `getTicket`
- Messages (posts + notes): `listMessages`
- Contacts (CUSTOMER role users): `listContacts`, `getContact`
- Users (AGENT role users): `listUsers`, `getUser`
- Teams: `listTeams`, `getTeam`
- Macros: `listMacros`, `getMacro`

## Not supported
- Tags: Kayako v1 has no global tags listing endpoint (tags are case-scoped only)

## Refused (schema-firewall)
- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- AI-suggested-reply fields
- Contact PII beyond email + name + phone
