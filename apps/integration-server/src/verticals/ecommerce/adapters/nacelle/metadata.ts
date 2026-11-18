export const metadata = {
  platform: 'nacelle',
  totalResources: 11,
  availableResources: ['collection', 'order', 'product', 'variant'],
  unavailableResources: [
    {
      resource: 'customer',
      reason:
        'Customer reads live only behind the NOMS Admin GraphQL API (schema documented at docs.nacelle.com/reference/noms-graphql), whose endpoint URL is never published — only the Storefront GraphQL host and the NOMS REST create-order host are',
    },
    {
      resource: 'discount',
      reason:
        'No discount/promotion type or field is documented anywhere in Nacelle\'s Storefront GraphQL or NOMS Admin GraphQL schemas',
    },
    {
      resource: 'fulfillment',
      reason:
        'Fulfillments are documented only as a nested connection under NOMS Order (Query.order.fulfillments) — reading them requires the same undocumented NOMS Admin GraphQL endpoint that blocks order reads; there is no REST fulfillment endpoint',
    },
    {
      resource: 'inventory',
      reason:
        'Nacelle has no root-level inventory query — inventory levels are reachable only as a nested variant.inventory.levels sub-object requiring a per-variant traversal, and location entries within it have no id field to key a canonical InventoryLevel on',
    },
    {
      resource: 'location',
      reason:
        'No Location/warehouse entity is queryable at the top level — locations appear only as an unidentified (no id field) nested object under variant.inventory.levels.location',
    },
    {
      resource: 'refund',
      reason:
        'No Refund type or refund-related field exists anywhere in the documented NOMS Admin GraphQL schema (docs.nacelle.com/reference/noms-graphql)',
    },
    {
      resource: 'transaction',
      reason:
        'The only payment record NOMS documents is a single embedded Payment object per Order, reachable only through the same undocumented NOMS Admin GraphQL endpoint that blocks order reads',
    },
  ],
} as const
