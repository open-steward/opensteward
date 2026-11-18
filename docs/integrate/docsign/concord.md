---
vertical: docsign
platform: concord
title: Integrating Concord
auth_type: oauth2
partner_program: false
estimated_time: 25min
last_verified: 2026-05-23
written_by: claude
---

# Concord

Concord is a contract-lifecycle-management (CLM) platform with built-in e-signature. The adapter wraps the Concord REST API and surfaces agreements, signers, and audit events into the canonical docsign schema.

## Auth model

- **OAuth 2.0 Authorization Code grant** is supported for multi-tenant integrations. The adapter also accepts a **static API key** for single-tenant deployments — both are surfaced in the credential form.
- Endpoints and scope strings are exposed via the Concord API documentation portal once a sandbox or production tenant is provisioned.
- Concord runs separate **Sandbox** (`uat.concordnow.com`) and **Production** environments; the adapter requires the environment label as part of configuration.

## Prerequisites

1. A Concord account at [concord.app](https://concord.app). Free trial is sufficient for sandbox use.
2. Sandbox upgrade: trial accounts must email `support@concord.app` with the list of invited sandbox users to unlock API key generation.
3. Once upgraded, generate credentials under the API section of your sandbox tenant; promote to production by repeating the registration against your live tenant.

## Configure in admin

1. Open `/platforms` in the admin UI, filter to **Docsign**, click **Concord**.
2. Fill **Configure**:
   - For OAuth: `clientId`, `clientSecret`, `redirectUri` (`${PUBLIC_BASE_URL}/auth/docsign/concord/callback`).
   - For API key: paste the generated key as `apiKey`.
   - `environment` — `sandbox` (`uat.concordnow.com`) or `production`.
3. Enable the adapter.

## Required scopes

Concord's scope catalog is gated behind the developer portal — the published API docs reference scopes by capability (agreement read/write, organization read, member read) but do not expose them as a global list. Request the minimum needed for the canonical surface and refine after testing.

## Webhooks

Concord delivers webhook events for agreement lifecycle (created, sent, signed, completed, voided). Subscriptions are configured per-tenant; signatures are delivered as HMAC-SHA256 in the `X-Concord-Signature` header (hex) using the secret you set when registering the subscription.

## Quirks worth knowing

- **Sandbox requires manual support unlock.** API key generation does not work on a vanilla trial — Concord support must promote the workspace.
- **Two environments, two registrations.** Sandbox credentials never authenticate against production.
- **CLM-shaped surface.** Concord models agreements rather than envelopes; the adapter maps `Agreement → Envelope` and exposes `concord_id` as `externalId`.

## References

- [Concord API getting started](https://help.concord.app/hc/en-us/articles/360055115911-getting-started-with-the-concord-api)
- [Concord API reference](https://api.doc.concordnow.com/)
