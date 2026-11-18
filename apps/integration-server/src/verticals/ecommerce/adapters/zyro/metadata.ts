/**
 * Zyro adapter resource coverage metadata.
 *
 * Zyro (now Hostinger Website Builder) does not publish a public ecommerce
 * store management REST API. The official Hostinger developer API
 * (developers.hostinger.com / api-mcp-server) only exposes two ecommerce
 * endpoints: list stores and create store. The Zyro-branded store API at
 * api.zyro.com is inaccessible (connection refused) with no public
 * documentation. Only products and orders were implementable from
 * inferred/observed API structure; all remaining resources are unverified
 * because authoritative API documentation could not be accessed.
 */
export const metadata = {
  platform: 'zyro',
  totalResources: 10,
  availableResources: [
    'product',
    'order',
  ],
  unavailableResources: [
    {
      resource: 'collection',
      reason: 'UNVERIFIED: api.zyro.com is inaccessible and Hostinger has no public ecommerce store management API; no collection/category endpoint documented',
    },
    {
      resource: 'customer',
      reason: 'UNVERIFIED: api.zyro.com is inaccessible and Hostinger has no public ecommerce store management API; no customer endpoint documented',
    },
    {
      resource: 'discount',
      reason: 'UNVERIFIED: api.zyro.com is inaccessible and Hostinger has no public ecommerce store management API; no discount endpoint documented',
    },
    {
      resource: 'fulfillment',
      reason: 'UNVERIFIED: api.zyro.com is inaccessible and Hostinger has no public ecommerce store management API; no fulfillment endpoint documented',
    },
    {
      resource: 'inventory',
      reason: 'UNVERIFIED: api.zyro.com is inaccessible and Hostinger has no public ecommerce store management API; no inventory endpoint documented',
    },
    {
      resource: 'location',
      reason: 'UNVERIFIED: api.zyro.com is inaccessible and Hostinger has no public ecommerce store management API; no location endpoint documented',
    },
    {
      resource: 'refund',
      reason: 'UNVERIFIED: api.zyro.com is inaccessible and Hostinger has no public ecommerce store management API; no refund endpoint documented',
    },
    {
      resource: 'transaction',
      reason: 'UNVERIFIED: api.zyro.com is inaccessible and Hostinger has no public ecommerce store management API; no transaction endpoint documented',
    },
  ],
} as const
