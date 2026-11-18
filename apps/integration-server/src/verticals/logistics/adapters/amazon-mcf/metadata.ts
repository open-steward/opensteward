export const metadata = {
  platform: 'amazon-mcf',
  totalResources: 8,
  availableResources: ['order', 'shipment', 'trackingevent', 'rate'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'MCF manages carrier selection internally; no carrier listing endpoint in FBA Outbound API v2020-07-01',
    },
    {
      resource: 'label',
      reason:
        'MCF handles label printing internally; no label generation endpoint exposed via SP-API FBA Outbound',
    },
    {
      resource: 'manifest',
      reason:
        'MCF manages carrier pickup manifests internally; no manifest endpoint in FBA Outbound API v2020-07-01',
    },
    {
      resource: 'warehouse',
      reason:
        'No fulfillment center listing in FBA Outbound API v2020-07-01; facility management is not part of the MCF SP-API surface',
    },
  ],
} as const
