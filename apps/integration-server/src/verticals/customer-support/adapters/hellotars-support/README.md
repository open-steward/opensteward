# HelpDesk (by LiveChat) adapter

Customer-support vertical adapter for HelpDesk (api.helpdesk.com).

OAuth 2.0 Authorization Code Grant via shared LiveChat Accounts service.
`HELPDESK_CLIENT_ID` / `HELPDESK_CLIENT_SECRET` env vars.

Base URL: `https://api.helpdesk.com/v1`
Auth: `Authorization: Bearer {access_token}`
Pagination: tickets by cursor (`pageSize` max 100 + `next.value`/`next.ID` from the last row); agents, tags and teams return the whole collection and are paged locally

## Supported resources

- Tickets (`/tickets`)
- Messages: the `message` and `followUpSent` events of `GET /tickets/{ticketID}` (HelpDesk has no messages endpoint; `/transactions` are attachment-upload sessions)
- Agents/users (`/agents`)
- Tags (`/tags`)
- Teams (`/teams`)

## Not supported

- Macros/canned-responses (HelpDesk has no such endpoint)
- Contacts as a standalone resource (requester is embedded in tickets)
- Webhook signature verification (not documented by HelpDesk)

## Refused (schema-firewall)

- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- AI-generated summaries
- Contact PII beyond email + name + phone
