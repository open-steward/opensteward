export const metadata = {
  platform: 'parcellab',
  totalResources: 8,
  availableResources: ['order', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'parcelLab has no REST endpoint to list or retrieve carriers; supported carriers are a static platform configuration, not a queryable API resource.',
    },
    {
      resource: 'label',
      reason:
        'parcelLab does not provide a label generation or retrieval API; it is a post-purchase tracking platform and does not issue shipping labels.',
    },
    {
      resource: 'manifest',
      reason:
        'parcelLab has no manifest concept or endpoint; manifests are not part of its tracking-focused API.',
    },
    {
      resource: 'rate',
      reason:
        'parcelLab does not offer a rate calculation API; it is a shipment-tracking platform and does not compute carrier rates.',
    },
    {
      resource: 'warehouse',
      reason:
        'parcelLab has no warehouse management endpoint; warehouse events are inbound status updates, not a queryable warehouse resource.',
    },
  ],
} as const
