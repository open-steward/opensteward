---
vertical: docsign
platform: clicksign
title: Integrating Clicksign
auth_type: api_key
partner_program: false
estimated_time: 15min
last_verified: 2026-05-20
written_by: claude
---

# Clicksign

Brazilian e-signature with ICP-Brasil + ITI-issued digital certificate support. Dominant BR provider.

## Auth model

Static API key as `?access_token=<key>` query parameter on every request.

## Prerequisites

1. Clicksign account at [clicksign.com](https://www.clicksign.com).
2. Generate an API key under **Configurações → Integração → API**.

Set up via Connect Link's credential form: `apiKey`.

## Webhooks

HMAC-SHA256 in `Content-Hmac` header (hex). Clicksign convention — note the non-standard header name.

## Refused fields

- Document content
- ICP-Brasil signature certificate payloads (legally distinct PKI artifacts)
