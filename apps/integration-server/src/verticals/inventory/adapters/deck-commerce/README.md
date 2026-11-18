# Deck Commerce adapter

Inventory surface for Deck Commerce, the API-first order management system
(OMS) for direct-to-consumer retail.

Auth: per-request HMAC token — there is no stored bearer token and nothing to
refresh. `credentialFields()` collects the tenant API base URL, site code, and
site API key. Each call computes

    token = UPPERCASE( HEX( SHA-256( lowercase(apiName) + timestampUTC + siteApiKey ) ) )

and sends it as the `Authorization` header alongside `apiVersion: 5`; the POST
body additionally carries `VerificationKey` (the same token), `TimestampUTC`
(format `M/D/YYYY HH:MM AM/PM`, UTC), and `SiteCode`.

Base URL: tenant-specific, shaped like `https://<tenant>.deckcommerce.com/api`,
supplied as a credential (`credentials.extra.apiBaseUrl`).

Webhook: none — `verifyWebhook` / `parseWebhookEvents` are not implemented.

## Resources
- Stock levels only. The inventory check endpoint (POST, logical API name
  `inventorycheck` by default, configurable via the adapter config) accepts a
  list of SKUs (`params.skus`, optionally `params.inventoryFeedName`) and
  returns availability per SKU per warehouse; an empty SKU list is sent for
  tenants that support full-catalog queries. `getStockLevel` takes an id of
  `SKU` or `SKU:warehouseCode`.

Products, suppliers, purchase orders, stock transfers, and stock adjustments
are not exposed by the Deck Commerce REST API — those operations live in the
upstream ERP/WMS, and inventory reaches Deck Commerce via SFTP feed files.
