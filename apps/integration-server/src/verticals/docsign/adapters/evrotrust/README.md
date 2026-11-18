# Evrotrust adapter

Evrotrust vendor REST API → canonical docsign schema.

## EU residency

Evrotrust is a Bulgarian eIDAS-qualified trust service provider (QTSP).
Use for Bulgarian / SEE / EU-resident customers requiring qualified
electronic signatures (QES) backed by mobile-app identity verification.

## Onboarding

1. Provision a vendor account with Evrotrust (DigiTech Consult / Iteco).
2. Receive your vendor API key and vendor number.

The Connect Link form collects the API key, vendor number, and the
environment (production / test). The adapter stores the API key on
`credentials.accessToken` and the vendor number + base URL on
`credentials.extra`. Every request is authenticated by an `Authorization`
header carrying the HMAC-SHA256 of the exact JSON body, keyed by
`SHA-256(apiKey)`, lowercase hex.

`getAuthUrl()` throws — Evrotrust has no interactive OAuth flow.

## Canonical mapping

- **Envelope** ← a signing *thread* (`threadID`). Read via
  `POST /document/group/status`; void via `POST /document/withdraw`.
- **Document** ← a single *transaction* (`transactionID`) within a thread.
  Read via `POST /document/status` (metadata only).

The vendor API has no list endpoint and no readable signer, audit-trail or
template resources, so those methods are not implemented (router returns
501).

## Webhooks

Evrotrust POSTs an unsigned callback to the vendor's `urlCallback` on
terminal status changes: `{ transactionID, status, rejectReason?,
automatedSignError? }`. There is no signature header, so the callback
cannot be cryptographically verified — restrict the endpoint to Evrotrust
source IPs at the network layer.

## Refused fields

- Document content / signed-file bytes
- Per-signer handwritten / biometric signature images
- Face-recognition / biometric identity-verification data
