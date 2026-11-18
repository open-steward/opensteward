export const metadata = {
  platform: 'orderchamp',
  totalResources: 11,
  availableResources: ['product', 'variant', 'collection', 'order', 'refund', 'fulfillment'],
  unavailableResources: [
    {
      resource: 'inventory',
      reason:
        "Orderchamp's inventoryLevelBulkAdjust mutation adjusts a variant's quantity without a location the adapter can list, and the canonical InventoryLevel requires a locationId. Echoing back a caller-supplied locationId would report stock at a location that does not exist.",
    },
    {
      resource: 'customer',
      reason:
        'Customer records only exist for suppliers using Orderchamp\'s Order Portal product: ' +
        '"When using our Order Portal product, you can import your own customers and invite ' +
        'them to your Order Portal" (Manage Customers). Marketplace and dropshipping-channel ' +
        'orders carry no customer object of their own.',
    },
    {
      resource: 'transaction',
      reason:
        'Orderchamp has no per-order payment/transaction ledger query or mutation. Payment ' +
        'status is a field on Order, not a separate Transaction resource; SupplierBill / ' +
        'SupplierInvoice are the supplier\'s own payout/invoicing documents, a different concept.',
    },
    {
      resource: 'location',
      reason:
        'Location/LocationConnection exist in Orderchamp\'s schema (referenced by ' +
        'inventoryLevelBulkAdjust\'s optional locationId for suppliers with multiple ' +
        'warehouses — "Fetch available warehouses for supplier"), but no top-level ' +
        'listLocations-shaped query is documented; this rebuild could not confirm one from ' +
        'public docs alone.',
    },
    {
      resource: 'discount',
      reason:
        'No discount, coupon or promotion query or mutation exists anywhere in Orderchamp\'s ' +
        'published schema.',
    },
  ],
} as const
