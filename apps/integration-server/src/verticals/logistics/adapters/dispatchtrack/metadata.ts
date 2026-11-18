export const metadata = {
  platform: 'dispatchtrack',
  totalResources: 8,
  availableResources: ['order', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'DispatchTrack is itself a last-mile fleet operator — it has no carrier-selection concept and does not expose external carriers via API.',
    },
    {
      resource: 'label',
      reason:
        'DispatchTrack manages delivery dispatches / service orders, not parcel label generation; no label endpoint exists.',
    },
    {
      resource: 'manifest',
      reason:
        'No manifest concept exists in the DispatchTrack last-mile delivery model; shipments are grouped into routes, not carrier manifests.',
    },
    {
      resource: 'rate',
      reason:
        'DispatchTrack does not provide carrier rate-shopping; it operates its own last-mile fleet and has no rate-quoting endpoint.',
    },
    {
      resource: 'warehouse',
      reason:
        'UNVERIFIED: DispatchTrack references store_code on service orders, suggesting a stores/places endpoint may exist, but API docs are behind authentication (TLS errors and JS-rendered pages prevented verification).',
    },
  ],
} as const
