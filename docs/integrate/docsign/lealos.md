---
vertical: docsign
platform: lealos
title: Integrating Lealos
auth_type: api_key
partner_program: false
estimated_time: 20min
last_verified: 2026-05-20
written_by: claude
---

# Lealos

Korean e-signature provider.

## Auth model

Static API key (Bearer). Use Connect Link's credential form.

## Prerequisites

1. Lealos account at [lealos.com](https://lealos.com).
2. Generate an API key under **API 관리** (API management).

## API doc completeness

Public API documentation for Lealos is sparse. The adapter uses best-guess endpoints aligned with the canonical schema. Adjust `apps/integration-server/src/verticals/docsign/adapters/lealos/constants.ts` if endpoint paths differ in your account.

## Webhooks

HMAC-SHA256 in `X-Lealos-Signature` (hex).

## Refused fields

- Document content
- Signature images
