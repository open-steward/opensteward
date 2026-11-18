# Libredesk adapter

Open-source self-hosted omnichannel support desk.

Auth: API key + API secret (Basic auth). Instance base URL is per-customer.
Credentials: `baseUrl`, `apiKey`, `apiSecret` (stored as Basic token).

Webhook: HMAC-SHA256 over raw body bytes, hex-encoded, header `X-Libredesk-Signature: sha256=<hex>`.

## Supported resources
- Tickets (conversations)
- Messages
- Contacts
- Users (agents)
- Tags
- Teams
- Macros

## Refused
- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- AI-suggested-reply / AI-completion fields
- Contact PII beyond email + name + phone
