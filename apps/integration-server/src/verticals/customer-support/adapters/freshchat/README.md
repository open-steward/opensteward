# Freshchat adapter

Customer-support vertical adapter for Freshchat (by Freshworks).

Auth: static API token (Bearer), stored as `accessToken`. Account domain
(e.g. `mycompany.freshchat.com`) stored in `credentials.extra.accountDomain`.
Base URL: `https://<accountDomain>/v2`.

Webhook: RSA SHA256 signature, header `X-Freshchat-Signature` (base64).
Public key supplied as the webhook secret in settings.

## Supported resources
- conversations → Ticket
- messages (conversation-scoped) → Message
- users (end-users) → Contact
- agents → User
- groups → Team

## Not supported (auto-501)
- Tags (no standalone Freshchat API v2 endpoint)
- Macros / canned responses (not in API v2)

## Refused
- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- AI-suggested-reply fields
- Contact PII beyond email + name + phone
