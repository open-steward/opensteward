# eGain adapter

eGain customer-support adapter for the OpenSteward customer-support vertical.

Per-tenant host (`acme.egain.cloud`). OAuth 2.0 Authorization Code flow using
per-tenant endpoints at `https://ai.egain.cloud/system/auth/{tenantId}-U/oauth2/`.
Scopes: `core.casemgr.read core.customermgr.read core.usermgr.read`.

REST API: `https://{tenantHost}/system/ws/v12/` (eGain Interaction API v12).

Env vars: `EGAIN_CLIENT_ID` / `EGAIN_CLIENT_SECRET`.

## Resources implemented
- Tickets → eGain Cases (`/interaction/case`)
- Messages → eGain Activities (`/interaction/activity?case={id}`)
- Contacts → eGain Customers (`/interaction/customer`)
- Users → eGain Agents (`/administration/user`)
- Teams → eGain Groups (`/administration/group`)

## Not implemented
- Tags — eGain Interaction API has no tagging endpoint
- Macros — eGain has no canned-response API surface in v12
- Webhooks — eGain does not document a standardized webhook signature scheme

## Refused (schema-firewall)
- Attachment content (only attachmentCount)
- Voice/call recording audio and transcripts
- Full email/chat body content (subject used as body)
- AI-suggested-reply fields
- Contact PII beyond email + name + phone
