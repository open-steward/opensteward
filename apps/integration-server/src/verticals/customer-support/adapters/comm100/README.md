# Comm100 adapter

Customer-support vertical adapter for the Comm100 omnichannel platform, on the
Server API v4 (https://developer.comm100.com/docs/server-api-introduction).

Auth: API key over HTTP Basic (agent email as username, API key as password),
with `siteId` on every request
(https://developer.comm100.com/docs/server-api-authentication). The host is
`api{n}.comm100.io/v4/` for Control Panel domain `dash{n}.comm100.io`,
n in 11, 12, 13, 15, 17 (credential field `portalNumber`).

## Supported resources

- Tickets: `GET ticketing/tickets` (pageIndex/pageSize, cut by the row pager), `GET ticketing/tickets/{id}`
- Messages: `GET ticketing/tickets/{id}/messages` (whole array, sliced locally)
- Contacts: `GET contact/contacts` (pageIndex/pageSize ≤ 500), `GET contact/contacts/{id}`
- Users: `GET global/agents` (whole array), `GET global/agents/{id}`
- Tags: `GET ticketing/tags` (whole array)
- Teams: `GET global/departments` (whole array), `GET global/departments/{id}`

## Not implemented

- Macros/canned messages
- getMessage (`GET ticketing/messages/{id}` is documented; not wired)
- getTag (`GET ticketing/tags/{id}` is documented; not wired)
- Webhooks

## Refused (schema-firewall)

- Attachment content (only attachmentCount)
- Contact PII beyond email, name and phone
