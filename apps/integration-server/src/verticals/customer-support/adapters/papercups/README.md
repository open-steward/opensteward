# Papercups adapter

Open-source customer messaging platform adapter for the customer-support vertical.

Auth: static API key via `Authorization: Bearer <api_key>`.
Base URL: `https://app.papercups.io/api/v1`

Supported resources: conversations (tickets), messages, customers (contacts), current user (/me).
Tags, teams, and macros are not exposed by the Papercups public API.

Webhook: challenge-response URL verification only; no HMAC signature header.
Events: `message:created`, `conversation:created`, `conversation:updated`.

## Refused
- Attachment content (only attachmentCount)
- Contact PII beyond email + name + phone
- Browser / OS / IP / geo fields on customers
