export const metadata = {
  platform: 'otto-market',
  totalResources: 10,
  availableResources: [
    'location',
    'order',
    'fulfillment',
    'refund',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'inventory',
      reason:
        "OTTO Market's Availability API holds one quantity per SKU with no location dimension, and its only location-like resource is returns-warehouse addresses. The canonical InventoryLevel requires a locationId, so reporting stock would mean pinning it to a synthetic location that listLocations never returns.",
    },
    {
      resource: 'product',
      reason:
        'OTTO Market documents that GET/POST /v5/products exist, but the public docs page shows no worked JSON example and no confirmed field names for the product/variation object, and no single-product GET or filter-by-sku endpoint — every canonical field mapping would be an unverified guess against an undocumented schema.',
    },
    {
      resource: 'collection',
      reason:
        'No collection endpoint appears anywhere in the OTTO Market functional-interfaces index; OTTO Market is a pure marketplace with no seller-mutable storefront collections.',
    },
    {
      resource: 'customer',
      reason:
        'OTTO Market exposes no separate buyer/customer resource; buyer PII, where present, is embedded in the order payload and explicitly state-gated (withheld while an order is ANNOUNCED).',
    },
    {
      resource: 'discount',
      reason:
        'The documented Price-Reductions interface is a seller-to-marketplace price discount mechanism, not a customer-facing discount-code resource matching the canonical Discount schema.',
    },
  ],
} as const
