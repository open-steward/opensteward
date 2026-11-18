export const metadata = {
  platform: 'colorme-shop',
  totalResources: 11,
  availableResources: ['product', 'variant', 'collection', 'customer', 'order', 'discount'],
  unavailableResources: [
    {
      resource: 'inventory',
      reason:
        'ColorMe Shop keeps one stock count per variant and has no location resource, while the canonical InventoryLevel requires a locationId. A write that echoed back whatever locationId the caller sent would report stock at a location that does not exist.',
    },
    {
      resource: 'location',
      reason: 'No location resource exists anywhere in the OpenAPI spec (https://api.shop-pro.jp/v1/spec/open_api.json) — ColorMe Shop is single-location.',
    },
    {
      resource: 'fulfillment',
      reason: 'No Fulfillment resource is documented; shipment tracking is only the `slip_number`/`tracking_url` fields on a sale_delivery, updated via PUT /v1/sales/{id}, never a createable/cancelable sub-resource.',
    },
    {
      resource: 'refund',
      reason: 'No refund resource is documented anywhere in the OpenAPI spec.',
    },
    {
      resource: 'transaction',
      reason: 'No transaction/payment-ledger resource is documented anywhere in the OpenAPI spec.',
    },
  ],
} as const
