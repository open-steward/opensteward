export const metadata = {
  platform: 'swell',
  totalResources: 10,
  availableResources: [
    'collection',
    'customer',
    'discount',
    'fulfillment',
    'order',
    'product',
    'refund',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'location',
      reason:
        'Swell has no listable location REST resource; shipping locations live in dashboard settings (/settings/shipping/locations) and are not exposed as a queryable API collection.',
    },
    {
      resource: 'inventory',
      reason:
        'GET /products:stock returns "a list of product stock adjustments" whose level is the "New stock level after the adjustment is applied", and the per-location stock on variants, stock_locations ("Stock distributed over inventory locations"), is an object whose shape is undocumented, so no location id can be read for an inventory level.',
    },
  ],
} as const
