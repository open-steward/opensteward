---
vertical: docsign
platform: signnow
title: Integrating SignNow
auth_type: oauth2
partner_program: false
estimated_time: 15min
last_verified: 2026-05-20
written_by: claude
---

# SignNow

Mid-market e-signature. Maps SignNow `documents` → canonical `Envelope`, field_invites → `Signer`, the same document → `Document`, history → `AuditTrailEntry`, template-flagged document records → `Template`.

## Auth model

OAuth 2.0 Authorization Code grant. Authorize at `https://docs.signnow.com/docs/signnow/oauth2/operations/get-a-oauth-2-userauth`; exchange at `https://api.signnow.com/oauth2/token` (Basic-auth with client id + secret).

## Prerequisites

1. Create a SignNow account at [app.signnow.com](https://app.signnow.com).
2. Open the [API dashboard](https://app.signnow.com/webapp/api-dashboard) and register an OAuth client.
3. Add `<base-url>/auth/docsign/signnow/callback` as a redirect URI.

## Configure in admin

1. Open `/platforms`, filter **Docsign → SignNow**.
2. Fill `clientId`, `clientSecret`, `redirectUri`.
3. Enable the adapter.

## Required scopes

Default: `*` (all). SignNow's permission model is coarse — adopt least privilege at the SignNow workspace level instead.

## Webhooks

SignNow signs webhook deliveries with HMAC-SHA256 of the raw body in `X-Signnow-Signature` (hex).

Subscribe to: `document.create`, `invite.fulfill`, `invite.decline`, `document.complete`, `invite.cancel`.

## Model quirks

SignNow treats **every entity as a document** — including templates (flagged with `is_template: true`). The adapter splits them: regular records → `Envelope`, template-flagged records → `Template`.
