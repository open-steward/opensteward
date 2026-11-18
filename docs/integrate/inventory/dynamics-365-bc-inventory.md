---
vertical: inventory
platform: dynamics-365-bc-inventory
title: Integrating Microsoft Dynamics 365 BC (Inventory)
auth_type: oauth2
partner_program: false
estimated_time: 30min
last_verified: 2026-05-23
written_by: claude
---

# Microsoft Dynamics 365 BC (Inventory)

Dynamics 365 Business Central is Microsoft's SMB ERP. The adapter targets the BC v2.0 REST API + custom API Pages and surfaces items, item categories, item ledger entries, warehouses (locations), and vendors into the canonical inventory schema.

## Auth model

- **OAuth 2.0 via Microsoft Entra ID (formerly Azure AD)** — there are no BC-native auth endpoints. Two flows are supported:
  - **Authorization Code grant** (delegated): authorize at `https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/authorize`, exchange at `https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token`. Uses the connecting user's BC permissions.
  - **Client Credentials grant** (service-to-service / S2S): same token endpoint, no user prompt. Requires the BC admin to grant the app consent in Entra **and** map the app to a BC user via **AAD Applications** in BC.
- Basic auth with Web Service Access Keys was **deprecated** for BC Online and removed by 2022 — OAuth 2.0 is mandatory.
- Production tokens use the resource scope `https://api.businesscentral.dynamics.com/.default`.

## Prerequisites

1. A Dynamics 365 Business Central tenant (cloud `https://businesscentral.dynamics.com` or on-premise with OAuth configured).
2. An **App Registration** in Entra ID under the customer (or partner) tenant:
   - Add **API permissions → APIs my organization uses → Dynamics 365 Business Central**.
   - For S2S: `API.ReadWrite.All` + `Automation.ReadWrite.All` (Application permissions); grant admin consent.
   - For delegated: `user_impersonation` (Delegated).
3. For S2S only: in BC, add the app to **Microsoft Entra Applications** and assign permission sets covering inventory (typically `D365 READ` + `D365 BUS PREMIUM` or a tighter custom set).

## Configure in admin

1. Open `/platforms` in the admin UI, filter to **Inventory**, click **Microsoft Dynamics 365 BC (Inventory)**.
2. Fill **Configure**:
   - `clientId` — your Entra App Registration's Application (client) ID.
   - `clientSecret` — a client secret from the App Registration.
   - `tenantId` — the BC customer's Entra tenant ID (or `common` for multi-tenant apps).
   - `environmentName` — the BC environment (e.g. `Production`, `Sandbox`).
   - `companyId` — the BC company GUID inside that environment.
   - `redirectUri` — `${PUBLIC_BASE_URL}/auth/inventory/dynamics-365-bc-inventory/callback`.
3. Enable the adapter.

## Required scopes

- Delegated: `https://api.businesscentral.dynamics.com/user_impersonation` + `offline_access` (for refresh).
- S2S: `https://api.businesscentral.dynamics.com/.default` (resource-default; the granted Application permissions take effect).

Avoid declaring per-method scopes — BC's OAuth permission model is coarse and managed in Entra.

## Webhooks

BC supports **Webhook Subscriptions** on standard and custom API Pages: `POST /api/v2.0/subscriptions` with a `notificationUrl`. BC validates ownership by POSTing a `validationToken` query parameter to the URL — the adapter responds with the token within 5 seconds. Each subsequent delivery includes a `clientState` field you can use as a shared secret check; BC does not sign payloads with HMAC.

Subscribe to `items`, `itemCategories`, and `companies/{id}/items` resources for the inventory surface.

## Quirks worth knowing

- **Company GUID is in every URL.** `/v2.0/{tenantId}/{environment}/api/v2.0/companies({companyId})/items` — pin all three.
- **API Pages vs OData UI pages.** API Pages (`/api/v2.0/...`) are 30-50% faster than legacy OData; Microsoft is deprecating OData UI page endpoints in 2027 Wave 1.
- **S2S apps must be mapped to a BC user.** Granting Entra consent is necessary but not sufficient; BC requires the explicit "Microsoft Entra Applications" mapping before requests succeed.
- **No HMAC on webhooks.** Use `clientState` plus IP allow-listing if you need stronger guarantees.

## References

- [Using OAuth to authenticate Web Services](https://learn.microsoft.com/en-us/dynamics365/business-central/dev-itpro/webservices/authenticate-web-services-using-oauth)
- [Using S2S authentication](https://learn.microsoft.com/en-us/dynamics365/business-central/dev-itpro/administration/automation-apis-using-s2s-authentication)
- [BC API documentation overview](https://learn.microsoft.com/en-us/dynamics365/business-central/dev-itpro/api-reference/v2.0/)
