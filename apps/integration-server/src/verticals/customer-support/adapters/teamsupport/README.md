# TeamSupport adapter

Customer-support vertical adapter for [TeamSupport](https://www.teamsupport.com/).

Base URL: `https://app.teamsupport.com`
Auth: HTTP Basic Auth — OrganizationID (username) + APIToken (password), obtained from Admin > API.
Endpoints: `/api/json/{resource}.json` — JSON in, JSON out.

## Supported resources

| Resource | List | Get |
|----------|------|-----|
| Tickets | YES | YES |
| Messages (ticket actions) | YES | ticket-scoped only |
| Contacts | YES | YES |
| Users (agents) | YES | YES |
| Teams (groups) | YES | YES |
| Tags | No — not a TeamSupport concept | — |
| Macros | No — not a TeamSupport concept | — |

## Webhooks

TeamSupport does not publish a webhook signature verification scheme.
`verifyWebhook` and `parseWebhookEvents` are intentionally omitted.

## Refused (schema-firewall)

- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- AI-suggested-reply fields
- Contact PII beyond email + name + phone
