---
vertical: docsign
platform: adobe-acrobat-sign
title: Integrating Adobe Acrobat Sign
auth_type: oauth2
partner_program: false
estimated_time: 25min
last_verified: 2026-05-20
written_by: claude
---

# Adobe Acrobat Sign

Adobe Acrobat Sign REST API v6. Maps `agreements` → canonical `Envelope`, `participantSetsInfo.memberInfos` → `Signer`, `fileInfos` → `Document`, `events` → `AuditTrailEntry`, `libraryDocuments` → `Template`.

## Auth model

OAuth 2.0 Authorization Code grant against Adobe Sign's OAuth endpoints (not the canonical Adobe IMS endpoints — Sign predates the IMS consolidation). Authorize at `https://secure.na1.adobesign.com/public/oauth/v2`; exchange at `/oauth/v2/token`.

The token response includes an `api_access_point` that names the per-account regional shard (na1, na2, eu1, eu2, jp1, …). The adapter stores it on `credentials.extra.apiAccessPoint` and routes every REST call there.

## Prerequisites

1. Open the [Adobe Sign API Applications](https://secure.na1.adobesign.com/account/accountSettingsPage) page.
2. Create an OAuth application.
3. Configure scopes: `agreement_read:account`, `agreement_write:account`, `agreement_send:account`, `library_read:account`.
4. Add `<base-url>/auth/docsign/adobe-acrobat-sign/callback` to the redirect URIs.

## Configure in admin

1. Open `/platforms`, filter **Docsign → Adobe Acrobat Sign**.
2. Fill `clientId`, `clientSecret`, `redirectUri`.
3. Enable the adapter.

## Required scopes

Default: `agreement_read:account agreement_write:account agreement_send:account library_read:account user_read:account`. Adobe Sign scopes use colon syntax (`scope:perimeter`).

## Webhooks

Adobe Sign signs webhooks with HMAC-SHA256 of the raw body using the client secret. The signature ships as `X-AdobeSign-ClientSecret` (base64). Adobe Sign's webhook registration also requires the endpoint to respond to a verification GET — the unified webhook handler does that automatically.

Subscribe to: `AGREEMENT_CREATED`, `AGREEMENT_ACTION_COMPLETED`, `AGREEMENT_WORKFLOW_COMPLETED`, `AGREEMENT_REJECTED`, `AGREEMENT_RECALLED`, `AGREEMENT_EXPIRED`.

## Shards

Adobe Sign assigns each account to a regional shard. The `api_access_point` returned from the token exchange is the canonical routing source. The adapter falls back to `api.na1.adobesign.com` if the field is missing.
