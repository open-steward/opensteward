# Rasayel adapter

Customer-support vertical adapter for Rasayel — a WhatsApp-first team inbox.

GraphQL API at `https://api.rasayel.io/api/graphql`. Auth: raw API key in `Authorization` header
(Rasayel issues a pre-encoded Basic auth value from the API Management tab).

Supported: Conversations (Ticket), Messages, ChannelUsers (Contact), AppUsers (User), Teams, Tags.
Not supported: Macros (platform does not offer canned-response macros).

Webhook: no documented signature verification; endpoint should be secured via network controls.
Event envelope: `{ event, id, data }` with Unix timestamp integers.

## Refused
- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- AI-generated content fields
- Contact PII beyond email + name + phone
