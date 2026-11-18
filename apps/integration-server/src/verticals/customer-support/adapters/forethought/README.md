# Forethought adapter

AI-overlay customer support platform for the customer-support vertical.

Auth: static Bearer token (`Authorization: Bearer {token}`) issued by Forethought's
implementation engineering team per tenant. No OAuth flow.

Base URLs:
- Solve API: `https://app.forethought.ai/solve/api/v1`
- Triage API: `https://api.forethought.ai` (inference-only; not a read resource)

Supported resources:
- **Tickets** — mapped from Forethought Solve conversations (`GET /conversations`, `GET /conversation/{id}`)
- **Messages** — mapped from conversation turns (`GET /conversation/{id}/turns`)

Unsupported (no public API): Contacts, Users, Teams, Tags, Macros (auto-501).

Webhook signature verification: not documented publicly; omitted.

## Refused
- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- AI-suggested-reply fields
- Contact PII beyond email + name + phone
