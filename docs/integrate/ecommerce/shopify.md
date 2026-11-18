---
vertical: ecommerce
platform: shopify
title: Integrating Shopify
auth_type: oauth2
partner_program: false
estimated_time: 15min
last_verified: 2026-05-14
written_by: matt
---

# Integrating Shopify

Shopify is the easiest of the v1 platforms — the entire developer-app
registration self-serves from your Partner dashboard. No review, no signed
agreements. About fifteen minutes end to end.

## 1. Prerequisites

- A Shopify Partner account. Free — sign up at
  [partners.shopify.com](https://partners.shopify.com) if you don't already have one.
- Either a development store you control or the production store you'll eventually
  install onto. Either works for the OAuth handshake.
- Admin access to your OpenSteward deployment — either the setup wizard at
  **Step 5 — Configure credentials**, or the day-2
  **Platforms → Ecommerce → Shopify** page.

## 2. Register the developer app

1. Sign in to your Partner Dashboard at `partners.shopify.com`.
2. Open **Apps** in the left sidebar, then click **Create app** and choose **Create app manually**.
3. Name the app something your support team will recognise — e.g. `Acme OpenSteward`.
   Shopify shows this name to merchants during install, so avoid internal-only codenames.
4. Click **Create app**. You land on the new app's **Configuration** tab.
   The next two sections live here.

## 3. Configure the callback URL

On the Configuration tab, scroll to **URLs** → **Allowed redirection URL(s)** and
paste the exact value below. Shopify rejects mismatches on protocol, host, port,
or trailing slash — copy it verbatim.

> **Callback URL**: `<your-deployment-url>/auth/ecommerce/shopify/callback`
>
> Example for the local dev stack: `http://localhost:3010/auth/ecommerce/shopify/callback`

The **App URL** field above it can point at the same path — Shopify only falls
back to it when the redirect URL is unreachable. Save the form before moving on;
Shopify won't let you commit scope changes until the URL row is persisted.

## 4. Set scopes

Open the **API access** tab. Under **Access scopes**, request the scopes the
OpenSteward adapter needs. These mirror the `recommendedScopes` on the
`ecommerce/shopify` adapter metadata one-for-one; keep the two lists in
sync whenever either changes.

- `read_orders` — Order history, line items, fulfilments, refunds. (required)
- `read_products` — Catalogue, variants, product images, collections. (required)
- `read_customers` — Customer profile, addresses, marketing consent. (required)
- `read_inventory` — Stock levels per location. (required)
- `read_locations` — Warehouse / store locations the inventory is bound to. (required)

> **Need writes?** The v1 adapter is read-only. If your consultancy
> engagement needs to push back (inventory adjustments, draft orders), add
> the matching `write_*` scope here *and* update `recommendedScopes` on the
> adapter so future installs stay in sync.

## 5. Drop the credentials into OpenSteward

1. Back on the Configuration tab, scroll to **Client credentials**. Copy the
   **Client ID** and reveal + copy the **Client secret**. The secret is only
   shown in full immediately after creation — treat it like a one-shot token.
2. Paste both into OpenSteward:

[Configure Shopify in OpenSteward](/platforms/ecommerce/shopify){.xlink}

If you're still inside the setup wizard, Step 4 (Credentials) is already pointed at the right
adapter — paste, save, and the wizard advances on its own. On a running deployment
use the day-2 configure surface linked above.

OpenSteward encrypts both fields at rest. The first connection appears when
someone follows a Connect Link or runs OAuth from the platforms page; nothing
else needs to be touched here.

## 6. Troubleshooting

Each failure mode below shows the exact error string OpenSteward surfaces,
then the cause and the fix. If you hit something not listed, check the
integration-server logs for the upstream Shopify response.

### `invalid_redirect_uri`

The redirect OpenSteward sent doesn't match any value in **Allowed
redirection URL(s)**. Shopify is strict — protocol, host, port, and trailing
slash all have to match.

**Fix:** open the Shopify Configuration tab, paste the exact value from
[Configure the callback URL](#3-configure-the-callback-url) above, save.

### `oauth_invalid_credentials`

The Client ID and Client secret got swapped, or the secret was saved as an
empty string (a copy-paste hazard since Shopify redacts it after creation).

**Fix:** reveal the Client secret in Shopify, re-copy both fields, and re-save
them in **Platforms → Ecommerce → Shopify**.

### `invalid_scope`

One of the scopes in the list above is unchecked in **API access**, or the
scopes have been saved in Shopify but the merchant authorised the app before
the change.

**Fix:** save the scope list in Shopify, then have the merchant re-authorise
from the Connect Link. Existing connections need to be deleted and re-created
— Shopify won't upgrade scopes in place.

### `shop must be a *.myshopify.com domain`

The Connect Link form was given a custom storefront domain (`shop.acme.com`)
instead of the underlying `acme.myshopify.com` host.

**Fix:** ask the merchant for the `*.myshopify.com` value — every Shopify store
has one, even when a custom domain is attached. It's visible in their admin
URL bar.
