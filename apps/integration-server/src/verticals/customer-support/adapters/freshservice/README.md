# Freshservice adapter

Customer-support vertical adapter for Freshservice.

Per-tenant subdomain (`<sub>.freshservice.com`). API key auth via HTTP Basic
(`Authorization: Basic base64(apiKey:X)`). Credentials: `subdomain` + `apiKey`.

Supported resources: tickets, conversations (messages), requesters (contacts),
agents (users), agent groups (teams). Tags and macros are not exposed by
Freshservice's public API and are omitted (auto-501). No documented webhook
HMAC signing — webhook.ts is omitted.

## Refused
- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- AI-suggested-reply fields
- Contact PII beyond email + name + phone
