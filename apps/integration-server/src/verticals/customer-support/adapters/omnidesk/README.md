# Omnidesk adapter

Customer-support vertical adapter for Omnidesk (`{subdomain}.omnidesk.ru`).

Auth: HTTP Basic Authentication — `Authorization: Basic base64(staffEmail:apiKey)`.
No OAuth flow. Credentials: `subdomain`, `staffEmail`, `apiKey`.

Webhooks: not documented by Omnidesk — webhook methods are not implemented.
Macros: not offered by Omnidesk — macro methods are not implemented.

## Supported resources
- Cases (tickets)
- Messages (replies + internal notes)
- Users (contacts / end-users)
- Staff (agents)
- Labels (tags)
- Groups (teams)

## Refused (schema-firewall)
- Attachment content (only attachmentCount)
- Voice/call recording audio and transcripts
- AI-generated reply fields
- Contact PII beyond email + name + phone
