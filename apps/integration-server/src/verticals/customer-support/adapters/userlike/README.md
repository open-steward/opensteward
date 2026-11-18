# Userlike adapter

Userlike (Lime Connect) JSON API v3 adapter for the customer-support vertical.

Base URL: `https://api.userlike.com/api/um/v3/`
Auth: bare API token in `Authorization` header (no "Bearer" prefix).
Docs: https://docs.lime-connect.com/developers/api/json

## Supported resources
- **Conversations → Tickets** (`GET /conversations/all/`, `GET /conversations/{id}/`)
- **Messages** (`GET /conversations/{id}/messages/`)
- **Contacts** (`GET /contact_identities/all/`, `GET /contact_identities/{id}/`)
- **Operators → Users** (`GET /operators/`, `GET /operators/{id}/`)

## Not supported (no API surface)
- Tags — Userlike has no standalone tags/topics endpoint
- Teams — operator groups appear only as nested fields in operator responses
- Macros — no equivalent feature
- Webhooks — Add-on API uses unsigned POST callbacks; no signature verification documented

## Refused (schema-firewall)
- Contact PII beyond email + name + phone (city/country/street kept in metadata only)
- Voice/call recording audio + transcripts
- AI-suggested-reply fields
