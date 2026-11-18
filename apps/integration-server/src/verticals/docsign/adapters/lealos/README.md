# Lealos adapter

Lealos REST API → canonical docsign schema. Lealos is a Korean e-signature provider.

## Documentation status

No first-party Lealos API documentation could be found (checked 2026-09-24). The base host `api.lealos.com` has no DNS record, `lealos.com` refuses connections, and the Wayback Machine holds 2003-2005 captures of the domain (a GoDaddy parking page, then a personal photo gallery) and nothing later except a 2014 favicon request that returned 404. The envelope and template paths are unverified guesses and have been left as they were.

`listSigners`, `getSigner`, `listDocuments`, `getDocument`, `listAuditTrailEntries` and `getAuditTrailEntry` refuse with 501 `NOT_SUPPORTED` before sending any request. The audit trail used to fall back to entries made up from document timestamps, and that fallback has been removed.

## Onboarding

1. Sign in to your Lealos account.
2. Generate an API key from the developer settings.
3. In OpenSteward, run the Connect Link flow for `lealos` and paste the key.

The key travels as `Authorization: Bearer <key>` on every request.

## Webhooks

Lealos signs deliveries with HMAC-SHA256 in the `X-Lealos-Signature` header (hex).

## Refused fields

- Document content / preview URLs
- Signature images
- Korean KISA / NIPA accredited-CA payloads
