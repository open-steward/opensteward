# Missive adapter

Customer-support vertical adapter for [Missive](https://missiveapp.com/).

Auth: personal API key (`missive_pat-...`). Bearer token in `Authorization` header.
Requires an organization subscribed to the Productive plan.

Base URL: `https://public.missiveapp.com/v1`

Resources mapped:
- Conversations → Tickets
- Messages      → Messages
- Contacts      → Contacts
- Users         → Users
- Shared Labels → Tags
- Teams         → Teams
- Responses     → Macros

Webhook: HMAC-SHA256 over raw body, hex-encoded, header `X-Hook-Signature: sha256=<hex>`.

## Refused
- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- AI-suggested-reply fields
- Contact PII beyond email + name + phone
