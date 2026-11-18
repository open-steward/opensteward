export const metadata = {
  platform: 'tcs-express',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'TCS Express is a single-carrier service with no multi-carrier listing endpoint in its public API.',
    },
    {
      resource: 'label',
      reason:
        'Labels are generated as part of the booking-creation response; no standalone list/get/void label endpoint is documented in the TCS Express API.',
    },
    {
      resource: 'manifest',
      reason:
        'No manifest endpoint is documented in the TCS Express API (the platform only exposes authentication, booking creation, and tracking).',
    },
    {
      resource: 'order',
      reason:
        'No order-management endpoint is documented in the TCS Express API; the platform does not expose order listing or CRUD operations.',
    },
    {
      resource: 'rate',
      reason:
        'UNVERIFIED: The TCS Express API base URL (api.tcsexpresslogistics.com) is unreachable; rate endpoints cannot be confirmed or denied from public documentation.',
    },
    {
      resource: 'warehouse',
      reason:
        'No warehouse endpoint is documented in the TCS Express API; the platform does not expose origin facility management.',
    },
  ],
} as const
