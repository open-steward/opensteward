# LiveAgent adapter

Customer-support vertical adapter for LiveAgent.

Per-tenant subdomain (`<sub>.ladesk.com`). API key auth via `apikey` request header.
Credentials: `subdomain` + `apiKey` (via credentialFields, no OAuth flow).

Base URL: `https://{subdomain}.ladesk.com/api/v3`

Webhook signature verification is NOT documented by LiveAgent — `verifyWebhook`
and `parseWebhookEvents` are not implemented on this adapter.

## Resources implemented
- Tickets (`GET /tickets`, `GET /tickets/{id}`)
- Messages (`GET /tickets/{id}/messages` — flattened from MessageGroups)
- Contacts (`GET /contacts`, `GET /contacts/{id}`)
- Agents/Users (`GET /agents`, `GET /agents/{id}`)
- Tags (`GET /tags`, `GET /tags/{id}`)
- Departments/Teams (`GET /departments`, `GET /departments/{id}`)
- Canned Messages/Macros (`GET /canned_messages`, `GET /canned_messages/{id}`)

## Refused
- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- AI-suggested-reply fields
- Contact PII beyond email + name + phone
