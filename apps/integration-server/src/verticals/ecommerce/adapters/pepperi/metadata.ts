export const metadata = {
  platform: 'pepperi',
  totalResources: 10,
  availableResources: ['customer', 'product'],
  unavailableResources: [
    {
      resource: 'collection',
      reason:
        "An Account's `Catalogs` field (confirmed via Pepperi's own bundled request-body schema at storage.pepperi.com/Developer/developer_body.js) is a list of catalog references assigned to that account for purchasing access — an access-control assignment, not a product grouping. Not a collection resource.",
    },
    {
      resource: 'location',
      reason:
        'No warehouse/location field exists anywhere in the confirmed Inventory or Account Inventory request-body schemas (storage.pepperi.com/Developer/developer_body.js) — Pepperi has no location resource to map.',
    },
    {
      resource: 'inventory',
      reason:
        "Canonical InventoryLevel requires a locationId. Pepperi's Inventory and Account Inventory schemas (confirmed via the bundled request-body definitions) carry no location dimension at all, so a locationId would have to be invented rather than read from real data.",
    },
    {
      resource: 'order',
      reason:
        "The confirmed POST /transactions request-body schema (storage.pepperi.com/Developer/developer_body.js) has no `Type` string field distinguishing Sales Order/Quote/Invoice/Credit Note — only a per-tenant-configurable `ActivityTypeID` integer with no documented, universal value meaning 'sales order'. Filtering on a guessed value would silently return the wrong records as orders.",
    },
    {
      resource: 'fulfillment',
      reason:
        'Pepperi models B2B order capture (Items/Accounts/Transactions/Inventory); it has no shipment or fulfillment resource.',
    },
    {
      resource: 'refund',
      reason:
        'A Pepperi Credit Note is a Transaction sub-type selected via a per-tenant activity type, not a standalone refund-on-an-order resource.',
    },
    {
      resource: 'transaction',
      reason:
        'No payment/gateway transaction resource is documented in the Pepperi API.',
    },
    {
      resource: 'discount',
      reason:
        'No discount/coupon resource is documented in the Pepperi API reference (Price Lists set prices; they do not apply discounts).',
    },
  ],
} as const
