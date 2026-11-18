# Zendesk adapter

Reference implementation for the customer-support vertical.

Per-tenant subdomain (`<sub>.zendesk.com`). OAuth 2.0 `read` scope.
`ZENDESK_CLIENT_ID` / `ZENDESK_CLIENT_SECRET` env vars.

Webhook: HMAC-SHA256 over `timestamp + body`, base64, header `X-Zendesk-Webhook-Signature`.

## Refused
- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- AI-suggested-reply fields
- Contact PII beyond email + name + phone
