# Kore.ai adapter

Customer-support adapter for the Kore.ai SmartAssist (Contact Center AI) platform.

Auth: JWT (HS256) in `auth` header + `accountId` header + `streamId` path param.
No OAuth redirect; the operator generates the JWT from their Client ID + Client Secret.

Base URL: `https://bots.kore.ai`
API prefix: `/agentassist/api/v1/public/{streamId}/`

## Supported resources
- Tickets — conversations (`/conversations`)
- Messages — conversation history / notes
- Contacts — end-user contacts (`/contacts`)
- Users — agents (`/organizations/{orgId}/agents`)
- Teams — queues (`/queues`)

## Refused (schema-firewall)
- Voice/call recording audio and transcripts
- AI-generated conversation summaries (TRIGGER_SUMMARY_EVENT)
- Attachment content (only attachmentCount)
- Contact PII beyond email + name + phone
- Inbound webhook signature verification (not documented by Kore.ai)
