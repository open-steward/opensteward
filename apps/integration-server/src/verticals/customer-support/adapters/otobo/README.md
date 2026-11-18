# OTOBO adapter

Customer-support vertical adapter for OTOBO (formerly OTRS).

Per-tenant server URL. Auth: UserLogin + Password passed with every request
(api_key model). Credentials stored as `accessToken=UserLogin`,
`extra.password`, `extra.serverUrl`, `extra.websvcName`.

REST base URL: `https://{server}/otobo/nph-genericinterface.pl/Webservice/{websvcName}/`

Supported operations (routes of the shipped GenericTicketConnectorREST,
development/webservices/GenericTicketConnectorREST.yml):
- listTickets — TicketSearch `GET /Ticket` (ids only; no offset, so page N
  asks for the first N × limit ids by TicketNumber and serves the last
  `limit`), then one TicketGet `GET /Ticket/{id,id,...}`
- getTicket — TicketGet `GET /Ticket/:TicketID`
- listMessages (ticket-scoped) — TicketGet `GET /Ticket/:TicketID?AllArticles=1`,
  every article in one response, sliced locally
- getMessage — not supported (no article-by-id operation in the connector)

Operation errors come back as HTTP 200 with an `Error` object; the client
throws on it. Created/Changed carry no zone and are read as OTOBOTimeZone,
whose shipped default is UTC.

Not supported (no standard endpoint in OTOBO Generic Interface):
- contacts, users, tags, teams, macros — auto-501

Webhooks: OTOBO Generic Interface is pull-based; there is no outbound webhook
push mechanism in the standard connector. webhook.ts is omitted.

## Refused
- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- AI-generated summaries
- Contact PII beyond email + name + phone
