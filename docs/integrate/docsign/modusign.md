---
vertical: docsign
platform: modusign
title: Integrating Modusign
auth_type: api_key
partner_program: false
estimated_time: 20min
last_verified: 2026-05-20
written_by: claude
---

# Modusign

Korean e-signature provider (Modu Solutions).

## Auth model

Static API key in `x-api-key` header. Use Connect Link's credential form.

## Prerequisites

1. Modusign account at [modusign.co.kr](https://modusign.co.kr).
2. Generate an API key under **API 설정** (API settings).

## Webhooks

HMAC-SHA256 in `x-modusign-signature` (hex).

## Refused fields

- Document content
- Signature images
