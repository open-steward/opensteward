# jSign adapter

jSign (by Consensus Cloud Solutions / Cygnature) REST API → canonical docsign schema.

## API

- **Base URL**: `https://api.jsign.com`
- **API version**: v2 (paths: `/api/v2/...`)
- **Swagger UI**: https://api.jsign.com/
- **OpenAPI spec**: https://api.jsign.com/swagger/v2/swagger.json

## Authentication

jSign uses Bearer-token (JWT) authentication. The adapter collects the user's
email address and password via the Connect Link form and exchanges them for a
JWT by POSTing to `/api/v2/Authorization/token`. There is no OAuth
Authorization-Code flow.

Every request requires two headers:

```
Authorization: Bearer <token>
app_auth_type: jsign-oauth2
```

## Endpoints used

| Operation               | Method | Path                                        |
|-------------------------|--------|---------------------------------------------|
| List envelopes          | POST   | `/api/v2/envelopes/list`                    |
| Get envelope            | GET    | `/api/v2/envelopes/{envelopeId}/details`    |
| Cancel envelope         | POST   | `/api/v2/envelopes/{envelopeId}/cancel`     |
| Envelope history        | GET    | `/api/v2/envelopes/{envelopeId}/history`    |
| List templates          | GET    | `/api/v2/templates/list`                    |
| Get template            | GET    | `/api/v2/templates/{templateId}/details`    |

## Webhooks

jSign signs webhook deliveries with HMAC-SHA256 of the raw body using a shared
secret. The signature is sent in the `X-jSign-Signature` header as a hex string.
The adapter verifies via `timingSafeEqual`.

## Refused fields

- Document binary content (not on the canonical schema)
- Signature images
- KYC attachments
