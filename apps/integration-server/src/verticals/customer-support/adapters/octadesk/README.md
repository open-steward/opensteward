# Octadesk adapter

Customer-support adapter for the Octadesk platform (Brazil).

Base URL: `https://api.octadesk.services`
Auth: Static API token (Bearer) + `octa-agent-email` header.
Token generated in Octadesk admin UI: Settings > Integrations > API.

Supported resources: tickets, interactions (messages), persons (contacts),
agents (users), groups (teams), tags.
Not supported: macros (Octadesk has no canned-response API).
Webhooks: No documented signature verification — webhook methods omitted.

Docs: https://developers.octadesk.com/reference/authentication

## Refused
- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- AI-suggested-reply fields
- Contact PII beyond email + name + phone
