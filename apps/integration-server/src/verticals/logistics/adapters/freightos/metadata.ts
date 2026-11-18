export const metadata = {
  platform: 'freightos',
  totalResources: 8,
  availableResources: ['rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'Freightos is a freight marketplace, not a carrier management system. No /carriers endpoint exists in the public API.',
    },
    {
      resource: 'label',
      reason:
        'Freightos handles international freight (ocean/air/trucking) via forwarders; label generation is not part of the Freightos API.',
    },
    {
      resource: 'manifest',
      reason:
        'Manifest submission is a carrier-side concept; the Freightos API has no manifest endpoints.',
    },
    {
      resource: 'order',
      reason:
        'Freightos is a rate/booking/tracking marketplace, not an OMS. No order management endpoints exist in the public API.',
    },
    {
      resource: 'warehouse',
      reason:
        'Freightos is not a WMS. No warehouse endpoints exist in the public API.',
    },
  ],
} as const
