export const metadata = {
  platform: 'izberg',
  totalResources: 10,
  availableResources: [
    'collection',
    'customer',
    'order',
    'product',
    'refund',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'discount',
      reason:
        'UNVERIFIED: Endpoint slug /v1/discount/ is confirmed via Python SDK source (UpdateableIcebergObject, endpoint="discount") but the Swagger UI requires a live browser to render; no field-level response shape was accessible to build a safe transform.',
    },
    {
      resource: 'fulfillment',
      reason:
        'IZBERG has no dedicated fulfillment resource; shipping is managed via merchant_order status transitions (confirm/send/cancel sub-actions on /v1/merchant_order/{id}/).',
    },
    {
      resource: 'inventory',
      reason:
        'No dedicated inventory level resource exists; stock is a field on productoffer/variation, not a separate queryable resource with location-level granularity.',
    },
    {
      resource: 'location',
      reason:
        'IZBERG is a cloud marketplace with no warehouse/location management concepts in the merchant API.',
    },
  ],
} as const
