---
vertical: docsign
platform: pandadoc
title: Integrating PandaDoc
auth_type: oauth2
partner_program: false
estimated_time: 15min
last_verified: 2026-05-20
written_by: claude
---

# PandaDoc

Template-heavy proposal + signature platform. Documents (templates filled with merge fields → envelopes), recipients, and audit trail via the PandaDoc REST API.

## Auth model

OAuth 2.0 Authorization Code grant. Authorize at `https://app.pandadoc.com/oauth2/authorize`; exchange at `https://api.pandadoc.com/oauth2/access_token`. PandaDoc also supports API-key auth — the adapter accepts a Bearer token regardless of issuance method.

## Prerequisites

1. Create a PandaDoc workspace at [pandadoc.com](https://www.pandadoc.com).
2. In **Settings → Integrations → API**, create a new application.
3. Add `<base-url>/auth/docsign/pandadoc/callback` as a redirect URI.

## Configure in admin

1. Open `/platforms`, filter **Docsign → PandaDoc**.
2. Fill `clientId`, `clientSecret`, `redirectUri`.
3. Enable the adapter.

## Required scopes

Default: `read+write`. PandaDoc's scope model is coarse-grained.

## Webhooks

PandaDoc signs webhook deliveries with HMAC-SHA256 of the raw body using the secret configured on the webhook. The signature ships in the **query string** as `signature=…` rather than a header. The unified webhook router copies it into the lower-cased header bag as `x-signature` before invoking the verifier.

Subscribe to: `document_state_changed`, `recipient_completed`, `document_completed_pdf_ready`, `document_deleted`.

## Model quirks

PandaDoc treats a **document AS the envelope** — there is no separate envelopes collection. The adapter maps `/documents` 1:1 to canonical `Envelope` and surfaces a single canonical `Document` per envelope.
