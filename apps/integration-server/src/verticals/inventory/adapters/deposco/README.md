# Deposco adapter

Inventory surface for Deposco, the cloud fulfillment and warehouse management
platform.

Auth: HTTP Basic. `credentialFields()` collects the Deposco URL (a
`*.deposco.com` host), a tenant code, API username, API password, and an
optional business unit; the username:password pair is
stored base64-encoded and sent as `Authorization: Basic <base64>`. No browser
OAuth flow.

Base URL: tenant-specific,
`https://<instance>.deposco.com/integration/<tenantCode>` — the instance host
and the tenant code are separate values. The instance is normalised to its
bare subdomain and anything outside `deposco.com` is rejected, because the
Basic credentials are sent to it. Both are stored in `credentials.extra`
(`instance`, `tenantCode`), with the business unit (default `DEFAULT`) in
`credentials.extra.businessUnit`.

Webhook: none — `verifyWebhook` / `parseWebhookEvents` are not implemented.

## Resources
- Products
- Stock levels — bulk list only; single stock-level fetch is not available
  (call `listStockLevels`)
- Locations (facilities)
- Suppliers (vendors)
- Purchase orders
- Stock transfers (transfer orders)
- Stock adjustments
