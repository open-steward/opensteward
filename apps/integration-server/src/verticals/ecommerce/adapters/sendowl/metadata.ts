export const metadata = {
  platform: 'sendowl',
  totalResources: 11,
  availableResources: ['product', 'discount', 'order', 'refund'],
  unavailableResources: [
    {
      resource: 'variant',
      reason:
        'SendOwl products are single-SKU digital goods with no independent variant endpoint. ' +
        'Bundles (grouping multiple products) are a separate resource, not a product variant.',
    },
    {
      resource: 'collection',
      reason:
        'SendOwl has no collection/category API — it is a checkout and delivery backend, not a ' +
        'browsable storefront with product groupings.',
    },
    {
      resource: 'location',
      reason: 'Digital-only platform; there is no warehouse or location endpoint in the SendOwl API.',
    },
    {
      resource: 'inventory',
      reason: 'Digital products have no stock levels; SendOwl has no inventory endpoint.',
    },
    {
      resource: 'fulfillment',
      reason:
        'Digital delivery is automatic on purchase (instant download / license issuance); ' +
        'SendOwl has no fulfillment or shipment-tracking endpoint.',
    },
    {
      resource: 'customer',
      reason:
        'SendOwl has no dedicated customer resource or endpoint — a `customer_id` appears only ' +
        'embedded on order objects, with no corresponding /customers CRUD API.',
    },
    {
      resource: 'transaction',
      reason:
        'SendOwl exposes no financial-transaction ledger endpoint; payment gateway identifiers ' +
        'appear only as `gateway_transaction_ids` embedded on the order.',
    },
  ],
} as const
