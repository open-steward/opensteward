# SysAid adapter

Customer-support vertical adapter for SysAid.

Per-tenant subdomain (`<account>.sysaidit.com`). Client-credentials OAuth2 (clientId + clientSecret).
Connect API v1: `https://{account}.sysaidit.com/connect/v1`

Docs: https://developers.sysaid.com

## Supported resources
- Tickets (service-records: `/service-records/search`, `/service-records/{id}`)
- Messages (SR activities: `/activities/sr/search`)
- Contacts (end-users: `/end-users`, `/end-users/{id}`)
- Users (agents: `/agents`, `/agents/{id}`)
- Teams (groups: `/groups`, `/groups/{id}`)

## Not supported (no discrete API endpoints)
- Tags → auto-501
- Macros → auto-501
- Webhooks (no documented signature scheme in Connect API)

## Refused (schema firewall)
- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- AI-suggested-reply fields
- Contact PII beyond email + name + phone
