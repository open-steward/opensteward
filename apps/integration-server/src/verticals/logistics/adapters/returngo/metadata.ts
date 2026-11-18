export const metadata = {
  platform: 'returngo',
  totalResources: 8,
  availableResources: [
    'trackingevent',
    'shipment',
    'order',
    'label',
    'carrier',
  ],
  unavailableResources: [
    {
      resource: 'rate',
      reason:
        'ReturnGO outsources carrier rating to third-party aggregators (EasyPost, Sendcloud, etc.); no /rates or getRates endpoint exists in the ReturnGO API',
    },
    {
      resource: 'manifest',
      reason:
        'No manifest concept or endpoint in the ReturnGO API; the platform does not support manifest creation or retrieval',
    },
    {
      resource: 'warehouse',
      reason:
        'No /warehouses endpoint; ReturnGO warehouse integration is push-only (ReturnGO POSTs to your WMS when an RMA is created, not the other direction)',
    },
  ],
} as const
