# Five9 adapter

Customer-support vertical adapter for the Five9 Cloud Contact Center platform.

API surface: Five9 SCIM 2.0 REST API (`https://api.five9.com/scim/v2`).
Auth: static Bearer token generated in the Five9 Admin console under
Admin > Identity > SCIM Settings. Requires Enterprise plan (Optimum/Ultimate)
with SAML 2.0 SSO enabled.

Supported resources:
- Contacts → SCIM Users (`GET /Users`, `GET /Users/{id}`)
- Users    → SCIM Users (`GET /Users`, `GET /Users/{id}`)
- Teams    → SCIM Groups (`GET /Groups`, `GET /Groups/{id}`)

Not supported (Five9 SCIM surface does not expose these):
- Tickets  — SOAP Configuration API only
- Messages — SOAP Configuration API only
- Tags     — SOAP Configuration API only
- Macros   — not a Five9 concept
- Webhooks — SCIM surface has no webhook delivery

## Refused
- Attachment content (only attachmentCount if applicable)
- Voice/call recording audio + transcripts
- AI-suggested-reply fields
- Contact PII beyond email + name + phone
