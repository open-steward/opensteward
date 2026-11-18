---
vertical: docsign
platform: universign
title: Integrating Universign
auth_type: api_key
partner_program: false
estimated_time: 15min
last_verified: 2026-05-20
written_by: claude
---

# Universign

French eIDAS QES provider (operated by Cryptolog). Second French source after Yousign — useful for redundancy or multi-region QES.

## Auth model

Static API key + secret pair, used as HTTP Basic auth. Use Connect Link's credential form.

## Prerequisites

1. Universign account at [universign.com](https://www.universign.com).
2. Generate an API key + secret pair under **Account → API**.

Set up via Connect Link's credential form: `apiKey` + `apiSecret`.

## Webhooks

HMAC-SHA256 in `X-Universign-Signature` (hex).

## Refused fields

- Document content
- Qualified signature certificates
