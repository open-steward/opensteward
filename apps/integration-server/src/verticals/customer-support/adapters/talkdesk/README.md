# Talkdesk adapter

Customer-support vertical adapter for Talkdesk.

OAuth 2.0 Authorization Code flow. US/EU/CA region support via `credentials.extra.region`.
`TALKDESK_CLIENT_ID` / `TALKDESK_CLIENT_SECRET` env vars.

Supported resources: Cases (tickets), Case Notes (messages), Contacts, Users (agents), Teams.
Not supported: Tags, Macros (no equivalent Talkdesk API).

Webhook: ECDSA-SHA512, public key (base64 DER) as the `secret` param, signature in `X-Hub-Ecdsa-Signature`.

## Refused
- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- AI-suggested-reply fields
- Contact PII beyond email + name + phone
