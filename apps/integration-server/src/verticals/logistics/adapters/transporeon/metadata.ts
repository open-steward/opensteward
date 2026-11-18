export const metadata = {
  platform: 'transporeon',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent', 'order'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'No /v1/carrier endpoint exists; the Carrier Interface is used BY carriers to pull transport data, not to enumerate carriers.',
    },
    {
      resource: 'rate',
      reason:
        'No rate-quoting or rate-calculation endpoint in the Carrier Interface API; freight rate management is a web-only product at Transporeon.',
    },
    {
      resource: 'label',
      reason:
        'Transporeon is a transport management marketplace and does not generate or host shipping labels.',
    },
    {
      resource: 'manifest',
      reason:
        'No manifest endpoint in the Carrier Interface API; carrier manifests are not managed via this integration.',
    },
    {
      resource: 'warehouse',
      reason:
        'No warehouse or location listing endpoint in the Carrier Interface API; facility/depot management is not exposed.',
    },
  ],
} as const
