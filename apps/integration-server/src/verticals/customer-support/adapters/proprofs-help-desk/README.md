# ProProfs Help Desk adapter

Customer-support vertical adapter for ProProfs Help Desk.

Auth: static API-key model — `account_email` + `token` (from "My Account" in the dashboard).
Both credentials are injected into every POST request body; there is no HTTP Authorization header.

Base URL: `https://www.proprofsdesk.com/app/api/v1`

Supported resources: tickets (list + get), messages (embedded in ticket response), contacts (getContact).

Webhook: no HMAC signature — ProProfs uses a URL-verification handshake at setup time only.
`verifyWebhook` always returns `true`; restrict delivery at the transport layer.

## Refused
- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- Contact PII beyond email + name + phone
