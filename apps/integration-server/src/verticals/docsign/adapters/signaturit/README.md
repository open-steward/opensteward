# Signaturit adapter

Signaturit REST API v3 → canonical docsign schema.

## EU residency

Signaturit is a Spanish eIDAS-qualified trust service provider. Use for
Iberian customers requiring QES/AES with EU data residency.

## Onboarding

1. Create a Signaturit account at [signaturit.com](https://signaturit.com).
2. Generate an API key under **Console → Settings → API**.

The Connect Link form collects the API key only; the adapter stores it
as `credentials.accessToken` and sends it on every call as
`Authorization: Bearer <apiKey>`.

`getAuthUrl()` throws — Signaturit has no interactive OAuth flow.

## Webhooks

Signaturit signs webhook deliveries with HMAC-SHA256 in the
`X-Signaturit-Signature` header.

## Refused fields

- Document content
- Per-signer handwritten/biometric signature images
- Signer audit-trail events that include biometric stroke data
