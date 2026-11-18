---
vertical: docsign
platform: namirial
title: Integrating Namirial
auth_type: api_key
partner_program: false
estimated_time: 20min
last_verified: 2026-05-20
written_by: claude
---

# Namirial

Italian eIDAS QTSP (Qualified Trust Service Provider). Large-enterprise QES coverage in Italy + EMEA.

## Auth model

Static API key (Bearer). Use Connect Link's credential form.

## Prerequisites

1. Namirial Sign Anywhere account.
2. Generate an API key under **Account → API**.

## Webhooks

HMAC-SHA256 in `X-Namirial-Signature` (hex).

## Refused fields

- Document content
- Qualified signature certificates
