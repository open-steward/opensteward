# Supportbench adapter

Customer-support vertical adapter for Supportbench.

Auth: API key via `username` + `password` headers (same key in both).
Base URL: `https://api.supportbench.com`
Docs: `https://supportbench.readme.io/reference/introduction`

## Supported resources
- **Tickets** (cases): `GET /case/:id`, list via `POST /activities`
- **Messages** (activities): `POST /activities` scoped by `cases` filter
- **Contacts**: `GET /contact/:id`

## Not implemented (no public endpoint)
- Users (agent list) — owner appears embedded on cases
- Tags — bare strings on cases, no list endpoint
- Teams (divisions) — embedded on cases only
- Macros — not a Supportbench concept
- Webhooks — delivery supported via workflow builder but signature spec not documented

## Refused
- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- AI-generated summaries
- Contact PII beyond email + name + phone
