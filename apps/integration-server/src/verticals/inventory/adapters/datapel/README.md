# Datapel WMS adapter

Australian warehouse management system built on the Breeze DataServer (ccBreezeSDK).
Supports both self-hosted Breeze DataServer installs and Datapel Cloud.WMS tenants
(hosted at `https://<tenant>.datapelwms.net/json`).

Auth: HTTP Basic credentials exchanged for a 24-hour session token.
Every request carries two headers:
- `Authorization: Basic <base64(user:pass)>` — the static authorisation code
- `AuthToken: <session_token>` — the 24-hour session token returned by `GET /token`

Credential fields collected at connect time: `username`, `password`, `serverUrl`.

Webhooks: Datapel does not publish an outbound-webhook signing specification.
`verifyWebhook` / `parseWebhookEvents` are intentionally omitted; the router
returns 501 automatically.

## Refused
- Product images / file URLs
- Supplier banking details / payment terms
- BOM / kit components / work orders
- Cost-method internal details (FIFO/LIFO/avg)
- Customer-facing order data
