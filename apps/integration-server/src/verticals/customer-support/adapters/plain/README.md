# Plain adapter

Customer-support vertical adapter for [Plain](https://www.plain.com).

GraphQL API at `https://core-api.uk.plain.com/graphql/v1`.
Auth: API key — `Authorization: Bearer <key>`.
Generate keys from Settings → Machine Users in your Plain workspace.

Resources supported: Threads (tickets), Timeline entries (messages), Customers (contacts), Label types (tags).

Webhook: HMAC-SHA256 over raw body, hex-encoded, header `Plain-Request-Signature`.
Configure secret in Settings → Request signing.

## Refused
- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- AI-suggested-reply fields
- Contact PII beyond email + name + phone

## Unsupported resources (no API)
- **Users (agents)** — Plain does not expose a public agent/user directory via its GraphQL API. User IDs appear as actor references inside thread assignees and timeline entries, but there is no `users` or `agents` query to enumerate or look up agents. `listUsers`/`getUser` are therefore intentionally omitted from this adapter.
