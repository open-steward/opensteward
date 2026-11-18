export const metadata = {
  platform: 'epages',
  totalResources: 11,
  availableResources: [
    'product',
    'variant',
    'customer',
    'order',
    'fulfillment',
    'discount',
  ],
  unavailableResources: [
    {
      resource: 'collection',
      reason:
        "ePages Beyond documents full CRUD on /api/categories (it's referenced elsewhere, e.g. category-scoped customer-group discounts), but its own request/response field schema was not locatable on the public product-management or shop reference pages during this rebuild — this adapter does not implement collection CRUD against a guessed field shape.",
    },
    {
      resource: 'location',
      reason:
        "Beyond's /api/shop/locations is a physical-store / Google-Business-listing resource (storeCode, companyName, address, regularHours, latLng, googlePrimaryCategory) for local-SEO purposes, not a stock/warehouse location.",
    },
    {
      resource: 'inventory',
      reason:
        'stock is not held per location, and the canonical InventoryLevel requires a locationId the platform cannot supply — GET /api/products/{id}/availability and the relative adjust-available-stock endpoint genuinely exist, but reporting a synthetic location id would point every level at a location listLocations (also unimplemented) never returns.',
    },
    {
      resource: 'refund',
      reason:
        'Beyond documents the refund process operations (/api/orders/{id}/processes/refunds — list, get, active, mark-paid) but not the refund resource\'s own field schema on the public reference pages reachable during this rebuild.',
    },
    {
      resource: 'transaction',
      reason:
        'Beyond documents the payment process operations (/api/orders/{id}/processes/payments — list, get, capture, mark-voided, mark-paid) and their status enum, but not the payment-process resource\'s own field schema on the public reference pages reachable during this rebuild.',
    },
  ],
} as const
