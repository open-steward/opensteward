export const metadata = {
  platform: 'listing-mirror',
  totalResources: 7,
  availableResources: ['product', 'stock-level'],
  unavailableResources: [
    {
      resource: 'location',
      reason:
        'Listing Mirror API v3 has no warehouse/location endpoint; inventory is account-wide per SKU with no per-location breakdown.',
    },
    {
      resource: 'supplier',
      reason:
        'Listing Mirror API v3 has no supplier endpoint; supplier management is not part of the platform\'s data model.',
    },
    {
      resource: 'purchase-order',
      reason:
        'Listing Mirror API v3 has no purchase order endpoint; the platform focuses on listing syndication and order fulfillment, not procurement.',
    },
    {
      resource: 'stock-transfer',
      reason:
        'Listing Mirror API v3 has no stock transfer endpoint; inter-location transfers are not supported in the API.',
    },
    {
      resource: 'stock-adjustment',
      reason:
        'Listing Mirror API v3 has no stock adjustment endpoint; inventory changes are applied directly via PATCH /v3/inventory/ with no adjustment audit trail exposed.',
    },
  ],
} as const
