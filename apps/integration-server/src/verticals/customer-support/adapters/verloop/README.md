# Verloop.io adapter

Customer-support vertical adapter for Verloop.io (Voice AI + conversational automation platform).

Auth: static API token in `Authorization` header (no "Bearer" prefix), plus `clientId` subdomain.
Base URL: `https://<client_id>.verloop.io/api/v1` (per-tenant).
All Campaign API endpoints are POST with JSON body.

## Supported resources

| Resource | Verloop concept |
|---|---|
| Tickets | Campaigns (`/Campaign/ListCampaigns`, `/Campaign/GetCampaign`) |
| Macros | Templates (`/Campaign/ListTemplates`, `/Campaign/GetTemplate`) |

## Unsupported (return 501)

The Verloop public API does not expose:
- Messages (individual message records — status callbacks only)
- Contacts
- Users / Agents
- Tags
- Teams / Departments
- Webhook signature verification (no documented signing scheme)

## Refused (schema-firewall)

- Voice/call recording audio and transcripts
- AI-generated reply suggestions
- Contact PII beyond email + name + phone
