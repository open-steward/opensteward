---
vertical: docsign
platform: yousign
title: Integrating Yousign
auth_type: oauth2
partner_program: false
estimated_time: 15min
last_verified: 2026-05-20
written_by: claude
---

# Yousign

EU-native, eIDAS-qualified e-signature provider headquartered in France. Maps Yousign `signature_requests` → canonical `Envelope`, `signers` → `Signer`, `documents` → `Document`, `audit_trails` → `AuditTrailEntry`, `signature_request_templates` → `Template`.

## Auth model

OAuth 2.0 Authorization Code grant against Yousign's partner endpoints. The adapter falls back to API-key auth via Connect Link's credential form when a partner-app client id is not available (Yousign's v3 API also accepts static API keys).

## Prerequisites

1. Create a Yousign workspace at [yousign.com](https://yousign.com).
2. Generate an API key under **Workspace settings → API**.
3. For partner-app OAuth, register a partner application with Yousign Support; for direct API-key use, no callback is needed.

## Configure in admin

1. Open `/platforms`, filter **Docsign → Yousign**.
2. Fill `clientId`, `clientSecret`, `redirectUri`.
3. Enable the adapter.

## Sandbox vs production

Set `credentials.extra.environment = "sandbox"` to route calls to `api-sandbox.yousign.app`. Default is production (`api.yousign.app`).

## Required scopes

Default: `signature_requests:read signature_requests:write`.

## Webhooks

Yousign signs webhook deliveries with HMAC-SHA256 of the raw body in `X-Yousign-Signature-256` (prefixed with `sha256=`).

Subscribe to: `signature_request.activated`, `signature_request.done`, `signer.signed`, `signer.declined`, `signature_request.expired`, `signature_request.canceled`.

## Why Yousign

For EU-resident customers requiring **qualified electronic signatures** under eIDAS, Yousign provides the trust-service-provider tier that DocuSign / Adobe Sign typically only offer as add-ons in their European editions. Choose Yousign when the compliance tier is the deciding factor.
