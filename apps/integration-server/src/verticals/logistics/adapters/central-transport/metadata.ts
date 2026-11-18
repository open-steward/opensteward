export const metadata = {
  platform: 'central-transport',
  totalResources: 8,
  availableResources: [
    'rate',
    'shipment',
    'trackingevent',
    'label',
    'warehouse',
  ],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'Piyovi exposes no carrier-listing endpoint; Central Transport is a single fixed carrier (CTII) with no API for enumerating carriers.',
    },
    {
      resource: 'manifest',
      reason: 'Piyovi has no manifest endpoint; end-of-day manifest submission is not part of the Piyovi unified API surface.',
    },
    {
      resource: 'order',
      reason:
        'Piyovi is a carrier-gateway platform, not an OMS; there is no order resource or endpoint.',
    },
  ],
} as const
