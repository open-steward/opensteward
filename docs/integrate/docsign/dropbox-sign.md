---
vertical: docsign
platform: dropbox-sign
title: Integrating Dropbox Sign
auth_type: oauth2
partner_program: false
estimated_time: 15min
last_verified: 2026-05-20
written_by: claude
---

# Dropbox Sign

Formerly HelloSign. Cleanest minimal envelope model in the docsign vertical — one `signature_request` ≈ one canonical `Envelope`.

## Auth model

OAuth 2.0 Authorization Code grant. Authorize at `https://developers.hellosign.com/docs/oauth/walkthrough/`; exchange at `https://app.hellosign.com/oauth/token`. The token exchange returns an `account_id` that is stored on `credentials.extra.accountId`.

## Prerequisites

1. Create an app at [app.hellosign.com/oauth/createApp](https://developers.hellosign.com/docs/oauth/walkthrough/).
2. Add `<base-url>/auth/docsign/dropbox-sign/callback` to the app's callback URLs.
3. Note **Client ID** and **Secret** under the app details.

## Configure in admin

1. Open `/platforms`, filter **Docsign → Dropbox Sign**.
2. Fill `clientId`, `clientSecret`, `redirectUri`.
3. Enable the adapter.

## Required scopes

Default: `basic_account_access`, `signature_request_access`, `template_access`, `account_access`.

## Webhooks

Dropbox Sign signs event callbacks with HMAC-SHA256 of `<event_time><event_type>` using the **app API key** as the secret. The signature ships in the JSON body as `event.event_hash` — not in a header. The adapter verifies by re-parsing the body.

Subscribe to: `signature_request_sent`, `signature_request_viewed`, `signature_request_signed`, `signature_request_all_signed`, `signature_request_declined`, `signature_request_canceled`.

## Model quirks

- `signature_request_id` is the canonical envelope id.
- Documents are exposed as a single bundled file at `/signature_request/files/{id}`. The adapter calls the manifest endpoint with `file_type=json` to surface per-file metadata. Bytes are never fetched.
- Audit-trail entries are **synthesised** from per-signer timestamps (`signed_at`, `last_viewed_at`, `last_reminded_at`) because Dropbox Sign has no separate audit-events endpoint.
