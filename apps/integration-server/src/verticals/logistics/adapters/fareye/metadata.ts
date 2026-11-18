export const metadata = {
  platform: 'fareye',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'UNVERIFIED: FarEye developer portal (developer.fareyeconnect.com) requires authenticated access; no public OpenAPI spec or field-level docs are available to confirm endpoint path or response shape.',
    },
    {
      resource: 'label',
      reason:
        'UNVERIFIED: ClickPost integration docs confirm FarEye has a label/manifestation API but the actual REST endpoint path and response field names are behind an authenticated developer portal and cannot be confirmed.',
    },
    {
      resource: 'manifest',
      reason:
        'UNVERIFIED: ClickPost integration docs confirm FarEye has a manifestation API but the actual REST endpoint path and response field names are behind an authenticated developer portal and cannot be confirmed.',
    },
    {
      resource: 'order',
      reason:
        'UNVERIFIED: ClickPost integration docs confirm FarEye has an order creation/cancellation API but the actual REST endpoint path and response field names are behind an authenticated developer portal and cannot be confirmed.',
    },
    {
      resource: 'rate',
      reason:
        'UNVERIFIED: FarEye developer portal homepage references "checkout rate shopping" and ClickPost references an EDD API, but the actual REST endpoint path and response field names are behind an authenticated developer portal and cannot be confirmed.',
    },
    {
      resource: 'warehouse',
      reason:
        'UNVERIFIED: FarEye developer portal (developer.fareyeconnect.com) requires authenticated access; no public documentation confirms a warehouse endpoint path or response shape.',
    },
  ],
} as const
