# HelpCenter.io adapter

Customer-support vertical adapter for [HelpCenter.io](https://helpcenter.io) — an AI-powered knowledge-base platform.

Auth: static API key via `apikey` header (not `Authorization: Bearer`).
Base URL: `https://api.helpcenter.io/v1`

## Supported resources

| Interface method | HelpCenter.io resource |
|-----------------|------------------------|
| `listTickets` / `getTicket` | `GET /v1/articles` — KB articles mapped to Ticket (published=resolved, draft=open) |
| `listTeams` / `getTeam` | `GET /v1/categories` — KB categories mapped to Team |

## Not supported (no API surface)

Messages, Contacts, Users, Tags, Macros, Webhooks — these resources do not exist in the HelpCenter.io API v1.
The HelpCenter.io API exposes only articles and categories; there are no conversation, contact, or agent endpoints.
Transform files for message, contact, and user are intentionally omitted — no API surface exists to populate them.

## Refused (schema-firewall)

- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- AI-suggested-reply fields
- Contact PII beyond email + name + phone
