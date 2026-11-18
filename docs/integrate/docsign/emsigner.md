---
vertical: docsign
platform: emsigner
title: Integrating emSigner
auth_type: api_key
partner_program: false
estimated_time: 25min
last_verified: 2026-05-21
written_by: claude
---

# emSigner (eMudhra)

eMudhra emSigner — Indian Aadhaar + DSC eSign provider. Operates **upstream** of Digio: Digio resells emSigner's rails for some flows. Direct integration gives operators contractual privity with the eSign CA.

## Auth model

API key + application ID, both supplied via Connect Link's credential form.

## Prerequisites

1. eMudhra account + emSigner subscription.
2. Generate `apiKey` + `applicationId` under **Administration → API Access**.

## Aadhaar / DSC posture

emSigner supports both Aadhaar OTP eSign and Digital Signature Certificate (DSC)-based signing. The canonical schema covers envelope + signer metadata for both; per-signer authentication mode lives in `Signer.metadata`. Aadhaar XML responses and DSC certificate payloads are deliberately not exposed.

## Webhooks

HMAC-SHA256 in `X-Emsigner-Signature` (hex).

## Refused fields

- Document content
- Aadhaar XML KYC responses
- eSign certificate payloads
- Signature images
