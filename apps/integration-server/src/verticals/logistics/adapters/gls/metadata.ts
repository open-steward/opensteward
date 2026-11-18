export const metadata = {
  platform: 'gls',
  totalResources: 8,
  availableResources: ['label', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'GLS exposes no carrier-listing endpoint; it is itself the single carrier and publishes no API to enumerate carriers.',
    },
    {
      resource: 'manifest',
      reason:
        'GLS provides a POST /endofday procedure that closes the day but returns a procedure result, not a retrievable manifest resource; there is no list/get manifest endpoint.',
    },
    {
      resource: 'order',
      reason:
        'GLS has no order management API; the platform processes parcels/shipments only and does not expose an order concept.',
    },
    {
      resource: 'rate',
      reason:
        'The POST /allowedservices endpoint returns service availability (product names) only — no pricing or transit-time estimates are provided.',
    },
    {
      resource: 'warehouse',
      reason:
        'GLS has no warehouse management API; warehouse/depot operations are internal to GLS and not exposed via any public endpoint.',
    },
  ],
} as const
