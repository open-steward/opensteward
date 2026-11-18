---
vertical: customer-support
platform: salesforce-service
title: Integrating Salesforce Service Cloud
auth_type: oauth2
partner_program: true
estimated_time: 30min
last_verified: 2026-05-23
written_by: claude
---

# Salesforce Service Cloud

Salesforce Service Cloud is the enterprise reference for case-based support. The adapter wraps the Salesforce REST API (`/services/data/vXX.X`) and exposes cases, contacts, accounts, users, queues, and email-messages into the canonical customer-support schema.

## Auth model

- **OAuth 2.0 Web Server (Authorization Code) flow.** Authorize at `https://login.salesforce.com/services/oauth2/authorize` (production / Developer Edition) or `https://test.salesforce.com/services/oauth2/authorize` (sandbox). Exchange via POST to `/services/oauth2/token` on the same host.
- The token response includes `instance_url` (e.g. `https://acme.my.salesforce.com`) — every subsequent API call must use that host, **not** `login.salesforce.com`.
- Access tokens are short-lived; refresh requires the `refresh_token` scope and is the standard pattern for headless operation.

## Prerequisites

1. A Salesforce org (production, sandbox, or Developer Edition).
2. A **Connected App** (or **External Client App**) created under **Setup → App Manager → New Connected App** with **Enable OAuth Settings** on. Add the redirect URI, select scopes, save, and note **Consumer Key** (client id) + **Consumer Secret**.
3. To distribute the integration to other Salesforce orgs at scale, register it on the **AppExchange** and complete Salesforce ISV / security review. Single-org deployments skip review entirely.

## Configure in admin

1. Open `/platforms` in the admin UI, filter to **Customer Support**, click **Salesforce Service Cloud**.
2. Fill **Configure**:
   - `clientId` — your Connected App's Consumer Key.
   - `clientSecret` — your Connected App's Consumer Secret.
   - `redirectUri` — `${PUBLIC_BASE_URL}/auth/customer-support/salesforce-service/callback`.
3. Enable the adapter.

Production or sandbox is not an adapter setting: the Connect page asks the customer for the **Salesforce org type** (`environment`: Production / Developer Edition, or Sandbox) before the redirect, because the two log in on different hosts.

## Required scopes

Request at minimum:

- `api` — REST / Bulk API access against the authenticated user's data (Service Cloud objects use this).
- `refresh_token` (alias `offline_access`) — required to refresh without re-prompting.
- `openid` — surfaces a stable user identifier; recommended for matching the connecting user.

Avoid `full` unless you genuinely need it — least-privilege review is a hard gate in AppExchange ISV review.

## Webhooks

**Not supported: the adapter rejects every delivery (fails closed).** Salesforce documents no signed push for Service Cloud records, so `/webhooks/customer-support/salesforce-service` cannot tell a real delivery from a forged one:

- **Outbound Messages** carry no payload signature. Salesforce's security guidance offers IP ranges, TLS, a client certificate (mutual TLS, checked at the TLS terminator, which the webhook handler never sees) and an `OrganizationId` in the body that any sender can copy. They are also SOAP/XML, which the JSON-only webhook route can neither parse nor acknowledge.
- **Change Data Capture and Platform Events** reach a subscriber through the Pub/Sub API (gRPC) or the Streaming API, which pull rather than push. The adapter does not subscribe to them.
- **Data 360 webhook data actions** are signed, but they are a separate product and do not carry Service Cloud case changes.

Keep cases fresh with the connection's [sync schedule](../../dev-api.md#sync-schedules) instead. The sources are cited in the adapter's `webhook.ts` and README (`apps/integration-server/src/verticals/customer-support/adapters/salesforce-service/`).

## Quirks worth knowing

- **Instance URL is canonical.** Always use the `instance_url` returned by the token exchange. Hardcoding `login.salesforce.com` past the OAuth dance will fail.
- **API version is in every URL.** `/services/data/v60.0/...` — pin the version explicitly.
- **AppExchange security review is mandatory for ISV distribution.** Allow 6-12 weeks; expect static analysis findings to block sign-off.
- **Sandbox vs production hosts differ.** `test.salesforce.com` for sandboxes, `login.salesforce.com` for production / DE — the host is part of the OAuth identity.
- **Bulk API for large pulls.** Case backfills above ~50k records should use Bulk API v2 to avoid REST governor limits.

## References

- [OAuth 2.0 Web Server Flow](https://help.salesforce.com/s/articleView?id=xcloud.remoteaccess_oauth_web_server_flow.htm&type=5)
- [Connected Apps and OAuth 2.0](https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/intro_oauth_and_connected_apps.htm)
- [Change Data Capture](https://developer.salesforce.com/docs/atlas.en-us.change_data_capture.meta/change_data_capture/cdc_intro.htm)
