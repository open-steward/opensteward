# Fluent Commerce adapter

Cloud-native Distributed Order Management System (DOMS) for omnichannel retail.

Auth: OAuth 2.0 resource-owner password grant via `FLUENT_INTEGRATION` client id.
  Token URL: `https://{ACCOUNT}.api.fluentretail.com/oauth/token` (production) or
  `https://{ACCOUNT}.sandbox.api.fluentretail.com/oauth/token` (sandbox)
  GraphQL:   `https://{account}.{env}.api.fluentretail.com/graphql`

Credentials: accountId, env (production/sandbox), username, password, clientSecret.

Pagination: cursor-based (`first` / `after` / `pageInfo.hasNextPage`), `first` at most 5000
("If the value exceeds 5000, it is replaced by 5000", GraphQL Operations). PageInfo has no
`endCursor`: the next `after` is the last edge's `cursor`. The caller's 1-based `page` is walked
through that cursor chain by the shared `pageByCursor`, keyed per connection.

## Supported resources
- Products (variantProducts query)
- StockLevels (inventoryPositions query)
- Locations (locations query)

## Unsupported Resources

- **purchase-order**: Fluent Commerce is a Distributed Order Management System (DOMS) focused on fulfilment orchestration, not procurement. It has no supplier purchase-order concept or GraphQL query in its public API; a `transform/purchase-order.ts` is therefore not present and should not be created.
- **supplier**: Fluent Commerce does not model vendors or supplier entities. The GraphQL schema exposes no supplier type or query; a `transform/supplier.ts` is therefore not present and should not be created.
- **stock-adjustment**: Inventory quantity changes in Fluent are recorded as InventoryPosition quantity deltas surfaced via the `inventoryPositions` query. There is no standalone stock-adjustment transaction entity in the public GraphQL API; a `transform/stock-adjustment.ts` is therefore not present and should not be created.
- **stock-transfer**: Fluent Commerce does not expose inter-location stock-transfer records as a first-class GraphQL entity. Location-to-location movement is modelled internally as fulfilment waves and is not readable via the public API; a `transform/stock-transfer.ts` is therefore not present and should not be created.

## Refused / schema-firewall
- Product images / media assets
- Supplier banking details / payment terms
- BOM / kit components / work orders
- Cost-method internal details (FIFO/LIFO/avg)
- Customer-facing order / fulfilment data

## Webhooks
Fluent Commerce signs webhooks with RSA SHA512 (private-key signing, public-key
verification). A shared HMAC secret is not used. `verifyWebhook` and
`parseWebhookEvents` are not implemented in this adapter.
