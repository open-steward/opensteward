# UseDesk adapter

Customer-support vertical implementation for UseDesk.

Static `api_token` auth (passed in every POST request body). Cloud base URL:
`https://secure.usedesk.com/uapi`. Self-hosted instances can override via
`credentials.extra.baseUrl`.

Webhook: UseDesk sends POST requests to the redirect URL configured in the API
channel settings. No HMAC signature verification is documented; verifyWebhook
and parseWebhookEvents are not implemented.

## Supported resources
- Tickets (`POST /uapi/tickets`, `POST /uapi/ticket`)
- Messages/Comments (`POST /uapi/ticket/comments`)
- Contacts/Clients (`POST /uapi/clients`, `POST /uapi/client`)
- Users/Agents (`POST /uapi/agents`, `POST /uapi/agent`)
- Tags (derived from ticket objects; no standalone endpoint)
- Teams/Groups (`POST /uapi/groups`, `POST /uapi/group`)

## Refused
- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- AI-suggested-reply fields
- Contact PII beyond email + name + phone
- Macros (not available in UseDesk REST API)
