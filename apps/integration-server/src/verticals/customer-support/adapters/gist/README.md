# Gist adapter

Gist REST API → canonical customer-support schema.

Base URL `https://api.getgist.com`. Static API key auth — no OAuth flow: the Connect Link
flow prompts for an API key, and the key travels as
`Authorization: Bearer <key>` on every request.

Webhook: HMAC-SHA256 over `timestamp + body`, base64, headers
`X-Gist-Signature` + `X-Gist-Signature-Timestamp`.

## Resources

`tickets`, `messages`, `contacts`, `users`, `tags`, `teams`, `macros` —
`list` + `get` on each, read-only.

## Refused
- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- AI-suggested-reply fields
