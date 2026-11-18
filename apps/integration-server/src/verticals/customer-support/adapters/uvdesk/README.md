# UVdesk adapter

Customer-support vertical adapter for UVdesk.

Per-tenant subdomain (`<sub>.uvdesk.com`). API-key (Bearer token) auth.
Token generated from Dashboard > Profile > Access Tokens.

Webhook: UVdesk does not document a webhook signature scheme; webhooks are not implemented.

## Refused
- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- AI-suggested-reply fields
- Contact PII beyond email + name + phone
