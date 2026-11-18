export const metadata = {
  platform: 'storehippo',
  totalResources: 10,
  availableResources: [
    'collection',
    'customer',
    'discount',
    'fulfillment',
    'location',
    'order',
    'product',
    'refund',
  ],
  unavailableResources: [
    {
      resource: 'inventory',
      reason:
        'Stock is documented only as a product\'s "inventory_quantity" ("The total number of product available in the stock for sale."), with no location',
    },
    {
      resource: 'transaction',
      reason:
        'The API reference documents no payments or transactions entity, and the legacy "Transactions" entity ms.store_ledger ("Lists the transactions of store.") holds the store\'s platform charges, with no order',
    },
  ],
} as const
