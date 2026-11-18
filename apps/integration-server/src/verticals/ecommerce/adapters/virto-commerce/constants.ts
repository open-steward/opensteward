/**
 * Virto Commerce REST API constants.
 *
 * Virto Commerce is open-source and self-hosted — every customer runs their
 * own Platform Manager instance at their own host. Verified against the
 * live Swagger of the public demo instance
 * (https://virtostart-demo-admin.govirto.com/docs/index.html,
 * VirtoCommerce.Platform / VirtoCommerce.Catalog / VirtoCommerce.Customer /
 * VirtoCommerce.Orders / VirtoCommerce.Inventory / VirtoCommerce.Marketing
 * swagger.json documents, fetched 2026-09-13).
 *
 * Every module search endpoint uses `skip`/`take` paging and returns either
 * `{ totalCount, items }` (the two Elasticsearch-backed "indexed search"
 * endpoints — catalog products and categories) or `{ totalCount, results }`
 * (every plain-CRUD module search: members/contacts, orders, inventory,
 * fulfillment centers, shipments, payments, promotions, coupons).
 */
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 200
