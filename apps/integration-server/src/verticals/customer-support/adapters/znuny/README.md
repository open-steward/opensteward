# Znuny adapter

Customer-support adapter for Znuny (self-hosted OTRS fork).

Auth: UserLogin + Password per-request (no OAuth). `instanceUrl` is
tenant-specific (e.g. `https://helpdesk.example.com`).

Implemented resources:
- Tickets (TicketSearch + TicketGet)
- Messages (articles embedded in TicketGet with AllArticles=1)

Not implemented (not available via GenericTicketConnectorREST):
- Contacts, Users, Tags, Teams, Macros — callers receive 501.

Webhooks: not documented by Znuny REST API; omitted.

## Refused (schema-firewall)
- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- AI-generated summaries
- Contact PII beyond email + name + phone
