# Desk365 adapter

Customer-support vertical adapter for [Desk365](https://www.desk365.io/).

Per-tenant subdomain (`<sub>.desk365.io/apis/v3/`). API key auth via the `Authorization` header.
API key is obtained from Desk365 → Settings → Integrations → API.

## Supported resources

- **Tickets** — `listTickets`, `getTicket`
- **Messages** — `listMessages` (`GET /v3/tickets/conversations?ticket_number=`, whole thread paged locally; private notes found with the `include_*` flags; no direct `getMessage`)
- **Contacts** — `listContacts` (`GET /v3/contacts`, 30 per `offset`), `getContact` (`GET /v3/contacts/details?primary_email=`; the id is the primary email)

## Refused (501 NOT_SUPPORTED)

- **Agents/Users** and **Groups/Teams** — the v3 spec (https://apps.desk365.io/apis/v3/api-docs?group=v3) has no agents or groups path

## Not supported (auto-501)

- **Tags** — no documented endpoint in Desk365 API v3
- **Macros** — canned responses not exposed via Desk365 API v3
- **Webhooks** — signature verification not documented; webhooks are Power Automate connector triggers only

## Refused (schema-firewall)

- Attachment content (only `attachmentCount` is surfaced)
- Voice/call recording audio + transcripts
- AI-generated reply drafts
- Contact PII beyond email + name + phone
