# LiveHelpNow adapter

Customer-support vertical adapter for LiveHelpNow.

Auth: OAuth 2.0 `client_credentials` — supply `clientId` + `clientSecret` via
`credentialFields()`; the adapter exchanges them for a Bearer token at
connect-time.

Base URL: `https://developer.livehelpnow.net`
Token URL: `https://developer.livehelpnow.net/oauth/token`

## Supported resources
- Tickets (`GET /api/tickets`, `GET /api/ticket/{id}`)
- Messages (ticket actions via `GET /api/ticket/{id}?include_actions=true`)
- Teams / departments (`GET /api/departments`)
- Users / operators (`GET /api/departments?include_operators=true`)
- Macros / canned responses (`GET /api/canned_sets` + `GET /api/canned_sets/{id}/items`)
- Contacts (date-scoped, `GET /api/analytics/chat/contact_list`)

## Not supported
- Tags: not listable (listTags refuses with 501; the API documents no tag list, only POST /api/ticket/{id}/tag)
- Webhooks (no documented signature verification)

## Refused
- Attachment content (only `attachmentCount`)
- Voice/call recording audio + transcripts
- Contact PII beyond email + name
