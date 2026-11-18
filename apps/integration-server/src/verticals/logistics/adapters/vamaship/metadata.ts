export const metadata = {
  platform: 'vamaship',
  totalResources: 8,
  availableResources: ['label', 'order', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'manifest',
      reason:
        'Vamaship public API (Air Domestic, Surface Domestic, and Miscellaneous APIs) exposes no manifest or pickup-schedule endpoint; only quote, book, track, label, NDR, and webhook routes are documented.',
    },
    {
      resource: 'carrier',
      reason:
        'The only supplier list is POST /dom/coverage, a lookup that requires an origin pickup pincode this connection does not hold, and its documented response carries only origin, status, success and destinations; the Air Domestic and Surface Domestic API Blueprints document only coverage, quote, book, cancel, GET /details/{reference_id}, GET /track/{order_ids}, GET /trackawb/{awbs} and GET /track/withReferenceNumbers/{references}.',
    },
    {
      resource: 'warehouse',
      reason:
        '"warehouse" appears in neither API Blueprint; the Air Domestic and Surface Domestic API Blueprints document only coverage, quote, book, cancel, GET /details/{reference_id}, GET /track/{order_ids}, GET /trackawb/{awbs} and GET /track/withReferenceNumbers/{references}.',
    },
  ],
} as const
