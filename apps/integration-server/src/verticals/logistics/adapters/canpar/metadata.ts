export const metadata = {
  platform: 'canpar',
  totalResources: 8,
  availableResources: [
    'carrier',
    'label',
    'rate',
    'shipment',
    'trackingevent',
  ],
  unavailableResources: [
    {
      resource: 'manifest',
      reason: 'UNVERIFIED: Canpar requires End of Day manifesting but the REST endpoint path under the .svc wrapper is not publicly documented; only SOAP-based evidence found',
    },
    {
      resource: 'order',
      reason: 'Canpar is a parcel carrier with no order management concept or endpoint',
    },
    {
      resource: 'warehouse',
      reason: 'Canpar has no warehouse or depot listing endpoint',
    },
  ],
} as const
