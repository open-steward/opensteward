# Sprinklr Service adapter

Customer-support vertical adapter for Sprinklr Service.

OAuth 2.0 Authorization Code grant (`api3.sprinklr.com/{env}/oauth`, per https://dev.sprinklr.com/getting-started).
Every request requires `Authorization: Bearer {token}` + `key: {api_key}` headers.

Webhook: HMAC-SHA256 over raw body (hex), header `X-Hub-Signature`.

## Supported resources
- Tickets (cases): POST /api/v1/case/search (offset `start`/`rows`, `hasMore`) + GET /api/v2/case/{caseId} per case
- Messages: GET /api/v2/case/associated-messages?id= (every id, sliced locally) + POST /api/v2/message/bulk-fetch
- Users (agents): GET /api/v1/bootstrap/resources?types=ACCESSIBLE_USERS
- Teams (queues): GET /api/v1/bootstrap/resources?types=CLIENT_QUEUES
- Macros: GET /api/v1/bootstrap/resources?types=MACROS

## Refused
- getContact (501): GET /api/v2/account/{accountId} reads the brand's own social accounts, not customers
- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- AI-suggested-reply fields
- Contact PII beyond email + name + phone
