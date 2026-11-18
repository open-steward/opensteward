export const metadata = {
  platform: 'fetchr',
  totalResources: 8,
  availableResources: [
    'shipment',
    'trackingevent',
    'order',
    'label',
  ],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'Fetchr is itself the single carrier; no carrier-management API endpoint is documented in any public source',
    },
    {
      resource: 'rate',
      reason: 'UNVERIFIED: docs.fetchr.us is unreachable (ECONNREFUSED); no rate-quote endpoint found in any accessible public source',
    },
    {
      resource: 'manifest',
      reason: 'UNVERIFIED: docs.fetchr.us is unreachable (ECONNREFUSED); no manifest endpoint found in any accessible public source',
    },
    {
      resource: 'warehouse',
      reason: 'UNVERIFIED: docs.fetchr.us is unreachable (ECONNREFUSED); no warehouse endpoint found in any accessible public source',
    },
  ],
} as const
