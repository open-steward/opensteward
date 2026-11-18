# FreeScout adapter

Customer-support vertical adapter for FreeScout (self-hosted, open-source).

Auth: API Key via `X-FreeScout-API-Key` header + tenant `instanceUrl`.
Base URL: `<instanceUrl>/api`  (per-tenant, configurable at credential exchange time).

Webhook: HMAC-SHA1 over raw body, base64-encoded, in `X-FreeScout-Signature` header.
Event type in `X-FreeScout-Event` header.

## Supported resources
- Tickets (conversations)
- Messages (threads)
- Contacts (customers)
- Users (agents)
- Tags
- Teams (mailboxes — closest structural equivalent)

## Not supported
- Macros (no equivalent in FreeScout)

## Schema firewall
- Attachment content (only attachmentCount)
- Contact PII limited to email + name + phone
