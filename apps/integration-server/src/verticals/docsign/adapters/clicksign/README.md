# Clicksign adapter

Clicksign REST API → canonical docsign schema. Clicksign is a Brazilian e-signature provider with ICP-Brasil compatibility.

## Onboarding

1. Sign in to [app.clicksign.com](https://app.clicksign.com) and open **Conta → API**.
2. Generate an Access Token. Clicksign uses a single, never-expiring API key per account.
3. In OpenSteward, run the Connect Link flow for `clicksign` and paste the token into the `apiKey` field.

The token is sent as `?access_token=<key>` on every request — Clicksign does not use header-based auth.

## Webhooks

Clicksign signs deliveries with HMAC-SHA256 in the `Content-Hmac` header (hex, optionally prefixed `sha256=`).

## Refused fields

- Document content / preview URLs (`/documents/{id}/download` is never called)
- Signature images
- ICP-Brasil digital certificate payloads
