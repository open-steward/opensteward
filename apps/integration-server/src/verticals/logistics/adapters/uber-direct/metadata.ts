export const metadata = {
  platform: 'uber-direct',
  totalResources: 8,
  availableResources: ['rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'Uber Direct is a single-carrier dispatch platform; no carrier-listing endpoint exists in the DaaS API.',
    },
    {
      resource: 'label',
      reason:
        'Uber Direct dispatches couriers directly and does not produce shipping labels; no label endpoint exists.',
    },
    {
      resource: 'manifest',
      reason:
        'Uber Direct has no manifest or SCAN-form concept; manifests are not part of the DaaS API.',
    },
    {
      resource: 'order',
      reason:
        'Uber Direct uses "delivery" as its core resource under /v1/customers/{id}/deliveries; no separate order endpoint exists in the DaaS API.',
    },
    {
      resource: 'warehouse',
      reason:
        'No warehouse management endpoint exists in the DaaS customers API; the Store Management API is a separate enterprise product on a different base path.',
    },
  ],
} as const
