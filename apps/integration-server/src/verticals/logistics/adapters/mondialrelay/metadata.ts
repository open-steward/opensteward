export const metadata = {
  platform: 'mondialrelay',
  totalResources: 8,
  availableResources: ['label', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'Mondial Relay is a single carrier; the API exposes no carrier-listing endpoint — only relay-point search, shipment creation, label generation, and tracking.',
    },
    {
      resource: 'manifest',
      reason:
        'The Mondial Relay SOAP/REST API has no manifest or end-of-day close endpoint; all 16 documented WSI2/WSI3/WSI4 operations cover labels, relay points, and tracking only.',
    },
    {
      resource: 'order',
      reason:
        'Mondial Relay is a carrier-only API; order management is not part of their API surface.',
    },
    {
      resource: 'warehouse',
      reason:
        'Mondial Relay exposes relay-point (pickup-point) search only (WSI2_RecherchePointRelais); there is no merchant warehouse management endpoint.',
    },
  ],
} as const
