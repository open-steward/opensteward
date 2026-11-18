export const metadata = {
  platform: 'coyote',
  totalResources: 8,
  availableResources: ['rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'UNVERIFIED: Coyote is a freight broker — no carrier-listing endpoint found in public docs; full API docs require authenticated portal access.',
    },
    {
      resource: 'label',
      reason:
        'UNVERIFIED: BOL/label download exists in CoyoteGO UI but no public REST endpoint for label retrieval is documented; API docs require authenticated portal access.',
    },
    {
      resource: 'manifest',
      reason:
        'UNVERIFIED: Coyote is a freight broker (BOLs, not parcel manifests); no manifest endpoint documented publicly; API docs require authenticated portal access.',
    },
    {
      resource: 'order',
      reason:
        'UNVERIFIED: No orders endpoint documented publicly; loads (/loads) are the booking primitive; API docs require authenticated portal access.',
    },
    {
      resource: 'warehouse',
      reason:
        'UNVERIFIED: Coyote is a non-asset-based freight broker with no warehouses; no warehouse endpoint documented publicly; API docs require authenticated portal access.',
    },
  ],
} as const
