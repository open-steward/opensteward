---
vertical: docsign
platform: docusign
title: Integrating DocuSign
auth_type: oauth2
partner_program: false
estimated_time: 20min
last_verified: 2026-05-20
written_by: claude
---

# DocuSign

DocuSign is the reference adapter for the `docsign` vertical. It exposes the full canonical surface — envelopes, signers, documents (metadata only), audit-trail entries, templates — against the DocuSign eSignature REST API v2.1.

## Auth model

- **OAuth 2.0 Authorization Code grant.** Authorize at `https://account-d.docusign.com/oauth/auth` (demo) or `account.docusign.com` (prod). Exchange via Basic-auth POST to `/oauth/token`.
- The token exchange follows up with `GET /oauth/userinfo` to resolve the user's default account, account name, and `base_uri` (the per-account API host).

## Prerequisites

1. A DocuSign developer account at [developers.docusign.com](https://developers.docusign.com).
2. In **My Apps & Keys**, create an integration using **Authorization Code Grant**.
3. Add `<base-url>/auth/docsign/docusign/callback` to the integration's redirect URIs.
4. Note the **Integration Key** (client id) and **Secret Key** (client secret).

## Configure in admin

1. Open `/platforms` in the admin UI, filter to **Docsign**, click **DocuSign**.
2. Fill **Configure**:
   - `clientId` — your Integration Key.
   - `clientSecret` — your Secret Key.
   - `redirectUri` — `${PUBLIC_BASE_URL}/auth/docsign/docusign/callback`.
3. Enable the adapter.

## Required scopes

Default scopes: `signature impersonation`. `impersonation` is required if you intend to add a JWT Grant flow alongside the auth-code flow.

## Webhooks (DocuSign Connect)

DocuSign Connect signs JSON deliveries with HMAC-SHA256 in `X-DocuSign-Signature-1` (base64). Configure Connect to deliver JSON. Key rotation supported via `-2` / `-3` headers — the verifier accepts any matching signature.

Subscribe to: `Envelope Sent`, `Envelope Delivered`, `Envelope Completed`, `Envelope Declined`, `Envelope Voided`, `Recipient Completed`, `Recipient Declined`.

## Refused at the wire

The adapter never calls `GET /envelopes/{id}/documents/{documentId}` with a non-metadata content type. Document content stays on DocuSign servers.

## Sandbox vs production

The adapter defaults to the demo environment (`account-d.docusign.com`). To target production, edit `apps/integration-server/src/verticals/docsign/adapters/docusign/constants.ts` and swap `OAUTH_*_URL` to the `account.docusign.com` equivalents.
