# Genesys Cloud CX adapter

Customer-support vertical adapter for Genesys Cloud CX (formerly PureCloud).

## Authentication

OAuth 2.0 Authorization Code grant. Login and API hosts are region-specific:

| Region code     | API host                        | Login host                        |
| --------------- | ------------------------------- | --------------------------------- |
| `us-east-1`     | `api.mypurecloud.com`           | `login.mypurecloud.com`           |
| `us-west-2`     | `api.usw2.mypurecloud.com`      | `login.usw2.mypurecloud.com`      |
| `eu-west-1`     | `api.mypurecloud.ie`            | `login.mypurecloud.ie`            |
| `eu-west-2`     | `api.euw2.mypurecloud.com`      | `login.euw2.mypurecloud.com`      |
| `eu-central-1`  | `api.mypurecloud.de`            | `login.mypurecloud.de`            |
| `ap-southeast-2`| `api.mypurecloud.com.au`        | `login.mypurecloud.com`           |

Set `GENESYS_CLOUD_CLIENT_ID` / `GENESYS_CLOUD_CLIENT_SECRET` env vars.

**Default scopes:** `conversations:readonly users:readonly routing:readonly analytics:readonly externalContacts:readonly`

Access tokens expire in 86400 seconds. A `refresh_token` is returned and can be exchanged with `grant_type=refresh_token`.

## API base URL

```
https://api.{region}/api/v2
```

All paths in this adapter are relative to this base, e.g. `/conversations`, `/users`, `/routing/queues`.

## Resource mapping

| Canonical resource | Genesys Cloud endpoint                                  |
| ------------------ | ------------------------------------------------------- |
| Tickets            | `GET /conversations`                                    |
| Messages           | `GET /conversations/chats/{id}/messages`                |
| Contacts           | `GET /externalcontacts/contacts`                        |
| Users              | `GET /users`                                            |
| Teams              | `GET /routing/queues`                                   |
| Tags               | `GET /routing/wrapupcodes`                              |
| Macros             | `GET /responsemanagement/responses`                     |

## Pagination

Offset-based. Requests accept `pageSize` (max 500, default 100) and `pageNumber` (1-indexed). Responses include `pageCount` and `total`.

## Webhook signature

Genesys Cloud signs webhook notifications using HMAC-SHA256 over the raw request body, Base64-encoded, in the `X-Hub-Signature-256` header (format: `sha256=<base64>`). The signing secret is set on the webhook subscription in the Genesys Cloud admin UI.

Verify by computing `HMAC-SHA256(secret, body)` encoded as Base64 and comparing with the header value after stripping the `sha256=` prefix.

## Refused fields

- Attachment content (only `attachmentCount` is surfaced)
- Voice/call recording audio and transcripts
- AI-generated summaries and suggested replies
- Contact PII beyond email, name, and phone
