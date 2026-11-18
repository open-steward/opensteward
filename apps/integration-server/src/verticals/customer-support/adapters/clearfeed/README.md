# ClearFeed adapter

Customer-support adapter for ClearFeed — a Slack-native support platform.

Auth: static Bearer token (Settings → Developer Settings → Generate Token).
Base URL: `https://api.clearfeed.app/v1/rest`
Pagination: cursor-based (`next_cursor` / `limit`).

Supported resources: tickets (requests), messages (inline via include=messages),
contacts (customers), teams.

Webhook: HMAC-SHA256 over `timestamp + body`, hex-encoded, header `X-CF-Signature`.
Timestamp replay guard: 5-minute window via `X-CF-Timestamp`.

## Refused
- Attachment content (only attachmentCount)
- AI-suggested-reply / ai_field_values fields
- Contact PII beyond email + name
- Voice/call recording audio + transcripts
