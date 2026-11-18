export const metadata = {
  platform: 'zim',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'ZIM is a single ocean-carrier line; their public API exposes no carrier-list endpoint.',
    },
    {
      resource: 'label',
      reason:
        'ZIM does not issue parcel labels; no label endpoint exists in their API.',
    },
    {
      resource: 'manifest',
      reason:
        'ZIM does not provide a manifest API; their public API is limited to container tracing.',
    },
    {
      resource: 'order',
      reason:
        'ZIM does not expose a logistics-order API; bookings are managed through their web portal and EDI, not a REST orders endpoint.',
    },
    {
      resource: 'rate',
      reason:
        'ZIM does not expose a public spot-rate or freight-rate REST endpoint; pricing is negotiated offline or via EDI.',
    },
    {
      resource: 'warehouse',
      reason:
        'ZIM is a shipping line, not a 3PL or warehouse operator; no warehouse endpoint exists in their API.',
    },
  ],
} as const
