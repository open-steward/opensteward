# Helpjuice adapter

Customer-support vertical adapter for Helpjuice (knowledge base platform).

Per-tenant subdomain (`<account>.helpjuice.com/api/v3`). API key auth.
Credentials: `account` subdomain + `apiKey` (from Settings > API Credentials).

Resource mapping:
- Tickets  → Articles (`/articles`)
- Messages → Article comments (`/articles/:id/comments`)
- Contacts → Users (`/users`)
- Users    → Users (`/users`)
- Teams    → Groups (`/groups`)
- Tags     → Not supported (no tags endpoint in Helpjuice v3)
- Macros   → Not supported (no canned-response concept)

Webhooks: Helpjuice does not document HMAC signature verification;
`verifyWebhook` always returns `true`.

## Refused
- Article body content (subject/name only in Ticket transform)
- Contact PII beyond email + name
