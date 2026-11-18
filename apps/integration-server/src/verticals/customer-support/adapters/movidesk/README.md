# Movidesk (Zenvia Service) adapter

Customer-support vertical adapter for Movidesk (rebranded as Zenvia Service).

Base URL: `https://api.movidesk.com/public/v1`
Auth: static API token — passed as `?token=<api_key>` query param on every request.
Pagination: OData `$top` / `$skip` (max 100 per page).

Webhook: trigger-based (no HMAC signature verification documented by Movidesk).

## Supported resources
- Tickets (`GET /tickets` with `$expand=clients,owner,actions`)
- Messages (ticket actions via `$expand=actions`)
- Contacts (`GET /persons?profileType eq 2`)
- Users/Agents (`GET /persons?profileType eq 1`)
- Tags (service catalog via `GET /services`)

## Not supported
- Teams (no standalone endpoint; embedded in person records only)
- Macros (no equivalent concept in Movidesk)

## Refused (schema-firewall)
- Attachment content (only `attachmentCount`)
- Voice/call recording audio + transcripts
- AI-generated summary fields
- Contact PII beyond email + name + phone
