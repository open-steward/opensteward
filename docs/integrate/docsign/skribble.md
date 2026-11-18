---
vertical: docsign
platform: skribble
title: Integrating Skribble
auth_type: oauth2_cc
partner_program: false
estimated_time: 15min
last_verified: 2026-05-20
written_by: claude
---

# Skribble

Swiss eIDAS QES + Swiss ZertES qualified provider. Use Skribble for legally-binding qualified electronic signatures in Switzerland.

## Auth model

Server-to-server token issuance: POST `{ username, "api-key": <key> }` to `https://api.skribble.com/v2/access/login`. The response is a JWT bearer token stored on `credentials.accessToken`.

## Prerequisites

1. Skribble account at [skribble.com](https://www.skribble.com).
2. Generate API credentials under **Settings → API**.

Set up via Connect Link's credential form: `username` + `apiKey`.

## Webhooks

HMAC-SHA256 in `X-Skribble-Signature` (hex).

## Refused fields

- Document content
- Qualified signature certificates (legally distinct biometric attestations)
