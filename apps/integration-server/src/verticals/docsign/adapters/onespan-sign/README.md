# OneSpan Sign adapter

OneSpan Sign (formerly eSignLive) REST API → canonical docsign schema.

## Onboarding

1. Sign in to OneSpan Sign and go to **ADMIN → API ACCESS**.
2. Copy the API key (starts with `esi_`). OneSpan calls this the *Integration Key*.
3. Pick environment — sandbox (`sandbox.esignlive.com`) or production (`apps.esignlive.com`).

The adapter is static-API-key based — no OAuth flow. Customers paste the API key through the Connect Link form.

Set in `.env` of the integration-server only if you want to pre-bake a key for testing:

```
ONESPAN_API_KEY=esi_...
```

## Sandbox vs production

Defaults target `https://sandbox.esignlive.com/api`. To switch to production, pass `credentials.extra.baseUrl = "https://apps.esignlive.com/api"` at credential-exchange time or update the constant.

## Webhooks

OneSpan signs callbacks with an HMAC-SHA256 of the raw body using the configured Callback Key. The signature header is `X-Esl-Signature` (hex).

## Refused fields

- Document content (`/documents/{id}/pdf` is intentionally not called)
- Signature images
- Identity-verification (KYC) attachments

These are not on the canonical schema. The adapter never requests them.

## Audit trail time zone

`GET /api/packages/{packageId}/audit` returns each event's `date-time` as `"2016-04-20 14:14:51"` with no zone, and the docs (https://docs.onespan.com/docs/retrieving-an-audit-trail) do not say which zone that is. `listAuditTrailEntries` (and `getAuditTrailEntry`, which reads through it) therefore needs the connection to name one: set `credentials.extra.timeZone` to an IANA zone (e.g. `"America/Toronto"`). Without it both refuse with 501 `NOT_SUPPORTED` before sending a request, rather than guessing UTC or reading the value in the server's own zone.
