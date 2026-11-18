export const metadata = {
  platform: 'ppl-cz',
  totalResources: 8,
  availableResources: [
    'carrier',
    'label',
    'order',
    'shipment',
    'trackingevent',
    'warehouse',
  ],
  unavailableResources: [
    {
      resource: 'manifest',
      reason:
        'CPL API has no manifest/handover-note endpoint; shipment batches produce labels only, no closeable manifest object',
    },
    {
      resource: 'rate',
      reason: 'CPL API exposes no public rate calculator endpoint',
    },
  ],
} as const
