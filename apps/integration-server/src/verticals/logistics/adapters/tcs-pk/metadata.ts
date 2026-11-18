export const metadata = {
  platform: 'tcs-pk',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent', 'rate'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'TCS PK is a single-carrier service with no multi-carrier listing endpoint in its public API.',
    },
    {
      resource: 'label',
      reason:
        'Labels are generated as part of the booking-creation response; no standalone list/get/void label endpoint is documented in the TCS PK API.',
    },
    {
      resource: 'manifest',
      reason:
        'No manifest endpoint is documented in the TCS PK API (COD booking API only exposes authentication, booking creation, and tracking).',
    },
    {
      resource: 'order',
      reason:
        'No order-management endpoint is documented in the TCS PK API; the platform does not expose order listing or CRUD operations.',
    },
    {
      resource: 'warehouse',
      reason:
        'No warehouse endpoint is documented in the TCS PK API; the platform does not expose origin facility management.',
    },
  ],
} as const
