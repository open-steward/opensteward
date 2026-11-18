# ChannelAdvisor adapter

ChannelAdvisor (now branded Rithum) is a multi-channel commerce platform.

Auth: OAuth 2.0 authorization-code flow with refresh tokens.
  Token endpoint: https://api.channeladvisor.com/oauth2/token
  Credentials: applicationId + sharedSecret (from Developer Console).
  Bearer token sent as `Authorization: Bearer <token>`.

Pagination: OData 4.0 — $skip / $top / @odata.nextLink

## Supported resources
- Products (list + get, with DCQuantities + Attributes expanded)
- StockLevels (DCQuantities per distribution center — list only)
- Locations (DistributionCenters — list + get)

## Unsupported Resources

- **Suppliers** — The ChannelAdvisor REST API v1 does not expose a supplier or vendor resource. Vendor/supplier relationships are managed within the CA account UI and are not available as a queryable REST endpoint.
- **PurchaseOrders** — The ChannelAdvisor REST API v1 has no purchase-order endpoint. Procurement flows are not part of the documented REST API surface.
- **StockTransfers** — The ChannelAdvisor REST API v1 has no stock-transfer resource. Moving inventory between distribution centers is not modelled by the REST API.
- **StockAdjustments** — The ChannelAdvisor REST API v1 has no stock-adjustment endpoint. Inventory quantity changes are reflected only in the AvailableQuantity fields on DCQuantities; there is no adjustment-log or audit-trail resource in the REST API.
- **Webhooks** — ChannelAdvisor does not document an HMAC or JWT webhook signing scheme for inventory resources; webhook parsing is omitted.

## Refused
- Product images / 3D assets / file URLs
- Supplier banking details / payment terms
- BOM / kit components / work orders
- Cost-method internal details (FIFO/LIFO/avg)
- Customer-facing order data
