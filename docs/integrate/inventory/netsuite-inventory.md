---
vertical: inventory
platform: netsuite-inventory
title: Integrating NetSuite Inventory
auth_type: oauth2
partner_program: true
estimated_time: 40min
last_verified: 2026-05-23
written_by: claude
---

# NetSuite Inventory

Oracle NetSuite is the enterprise reference SaaS ERP. The adapter targets the inventory surface of NetSuite REST Web Services — items (inventoryitem, assemblyitem, kititem), locations, inventoryitemlocations, inventorynumber, inventoryadjustment, and vendors — and maps them into the canonical inventory schema.

## Auth model

- **OAuth 2.0 Authorization Code grant** (user-delegated): authorize at `https://{accountID}.app.netsuite.com/app/login/oauth2/authorize.nl`. Exchange via POST to `https://{accountID}.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token`.
- **OAuth 2.0 Client Credentials grant (M2M)**: same token endpoint, signed JWT client assertion (RS256/ES256) using a certificate uploaded to the user mapped to the integration record. This is the standard pattern for headless SuiteApp installs.
- Access tokens expire after `3600` seconds; refresh tokens last `7` days (Auth Code flow). Most production SuiteApps combine the flows — Auth Code once to upload the certificate, then Client Credentials for ongoing access.
- `{accountID}` is the customer's NetSuite account id (e.g. `1234567` or `1234567_SB1` for a sandbox). Lowercase + underscores in the hostname; dashes are not valid.

## Prerequisites

1. A NetSuite account (production or sandbox / Release Preview). Inventory module + REST Web Services + OAuth 2.0 features must be enabled under **Setup → Company → Enable Features**.
2. An **Integration Record** under **Setup → Integration → Manage Integrations → New** with **OAuth 2.0** enabled and the desired grants (Authorization Code, Client Credentials, or both). Note the **Consumer Key** and **Consumer Secret**, and add the redirect URI.
3. For SuiteApp distribution: register the SuiteApp via **SuiteApp Marketplace** and pass Oracle SuiteApp review (single-customer installs skip this).
4. The authenticating user must have a role with `REST Web Services` + appropriate inventory permissions (Items, Locations, Inventory Adjustments — Full or View as needed).

## Configure in admin

1. Open `/platforms` in the admin UI, filter to **Inventory**, click **NetSuite Inventory**.
2. Fill **Configure**:
   - `clientId` — Consumer Key from the Integration Record.
   - `clientSecret` — Consumer Secret from the Integration Record.
   - `accountId` — the customer's NetSuite account id (with `_SB1` suffix for sandboxes).
   - `redirectUri` — `${PUBLIC_BASE_URL}/auth/inventory/netsuite-inventory/callback`.
3. Enable the adapter.

## Required scopes

NetSuite uses a single `rest_webservices` scope (plus `restlets` and `suite_analytics` for the other surfaces). The effective permissions come from the **NetSuite role** the connecting user holds. Lock that role down to the inventory + items + locations + warehouse permissions.

## Webhooks

NetSuite does not provide first-class outbound webhooks. The canonical near-real-time mechanism is a **User Event Script** (SuiteScript 2.x) deployed to inventory record types that pushes to an external URL on `afterSubmit`. Sign these outbound calls with a shared secret HMAC-SHA256 in an `X-Netsuite-Signature` header (hex) — the adapter verifies against the configured secret.

For pure pull integrations, use **SuiteQL** + the `lastModifiedDate` filter on items / inventoryitemlocations / inventoryadjustment for delta sync.

## Quirks worth knowing

- **AccountID is in every URL.** Production: `1234567.suitetalk.api.netsuite.com`. Sandbox: `1234567_SB1.suitetalk.api.netsuite.com`. Release preview: `1234567_RP.suitetalk.api.netsuite.com`. Mixing them issues tokens that don't authenticate.
- **TBA is the legacy mechanism.** Token-Based Authentication (TBA) is still supported but Oracle is steering integrations to OAuth 2.0 — prefer OAuth 2.0 for new builds.
- **Role permissions cap everything.** A correct token + wrong role = silent permission errors. Audit the role under **Setup → Users/Roles → Manage Roles**.
- **Inventory location semantics.** `inventoryitemlocations` carries on-hand by location; the base `inventoryitem` only summarises across locations. Don't confuse them in transforms.
- **SuiteApp review is mandatory for marketplace distribution.** Allow 4-8 weeks; static analysis findings are common blockers.

## References

- [OAuth 2.0 Authorization Code Grant Flow](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_158074210415.html)
- [OAuth 2.0 in NetSuite](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/chapter_157769826287.html)
- [REST Web Services with OAuth 2.0](https://chamilelle.medium.com/setup-rest-web-service-and-oauth-2-0-in-your-netsuite-account-c4243240bc3f) (community walkthrough)
