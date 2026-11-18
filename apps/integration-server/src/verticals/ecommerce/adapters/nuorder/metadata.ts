export const metadata = {
  platform: 'nuorder',
  totalResources: 11,
  availableResources: ['collection', 'customer', 'fulfillment', 'location', 'product'],
  unavailableResources: [
    {
      resource: 'discount',
      reason: 'Price sheets are not discounts and NuORDER has no discount/promotion resource',
    },
    {
      resource: 'inventory',
      reason:
        'No bulk inventory list endpoint is documented — only single-record GET/POST/DELETE /api/inventory/{id} by an opaque id with no documented way to discover that id without already holding it',
    },
    {
      resource: 'order',
      reason:
        'Order endpoints (GET/PUT/POST /api/order[s]/...) are documented but no request or response JSON field names are shown anywhere accessible in the public reference (https://assets.nuorder.com/api-docs/index.html) — implementing create/update against an unverified schema risks silently corrupting a real wholesale order',
    },
    {
      resource: 'refund',
      reason:
        'POST /api/payment/{id}/refund is a documented endpoint, but like Payment generally, no request/response field names are shown in the public reference',
    },
    {
      resource: 'transaction',
      reason:
        'Payment endpoints (authorize/charge/group) are documented but no request/response field names (amount, currency, method) are shown in the public reference',
    },
    {
      resource: 'variant',
      reason:
        'NuORDER has no separate variant/SKU resource — `sizes` and `pricing` are opaque arrays embedded directly on the product',
    },
  ],
} as const
