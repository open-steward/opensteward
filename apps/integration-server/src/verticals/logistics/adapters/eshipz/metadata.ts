export const metadata = {
  platform: 'eshipz',
  totalResources: 8,
  availableResources: [
    'carrier',
    'rate',
    'shipment',
    'trackingevent',
  ],
  unavailableResources: [
    {
      resource: 'label',
      reason:
        'No dedicated label-list endpoint; label URL is embedded inside the shipment response (files.label.label_meta.url)',
    },
    {
      resource: 'manifest',
      reason:
        'eShipz marketing references handover manifest generation but no public REST endpoint exists for listing or creating manifests via API',
    },
    {
      resource: 'order',
      reason:
        'eShipz supports orders conceptually but no public REST endpoint is documented for listing or creating orders via the API; API docs are behind authentication',
    },
    {
      resource: 'warehouse',
      reason:
        'No pickup-location or warehouse listing endpoint is documented in the public eShipz API; API docs are behind authentication',
    },
  ],
} as const
