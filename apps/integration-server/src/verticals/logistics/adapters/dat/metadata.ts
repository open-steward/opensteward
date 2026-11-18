export const metadata = {
  platform: 'dat',
  totalResources: 8,
  availableResources: ['shipment', 'rate', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'UNVERIFIED: DAT is a freight load-board marketplace — the Carrier Management Suite exists in DAT One but no public REST carrier-listing endpoint is documented; full API docs require authenticated portal access (developer.dat.com).',
    },
    {
      resource: 'label',
      reason:
        'UNVERIFIED: DAT is a freight load-board/rate platform, not a parcel carrier; no public REST endpoint for label creation or retrieval is documented; full API docs require authenticated portal access.',
    },
    {
      resource: 'manifest',
      reason:
        'UNVERIFIED: DAT is a freight load-board/rate platform; no manifest endpoint is documented publicly; full API docs require authenticated portal access.',
    },
    {
      resource: 'order',
      reason:
        'UNVERIFIED: DAT is a freight marketplace — loads (/loads) are the booking primitive; no dedicated orders endpoint is documented publicly; full API docs require authenticated portal access.',
    },
    {
      resource: 'warehouse',
      reason:
        'UNVERIFIED: DAT is a non-asset-based freight marketplace with no warehouse management capability; no warehouse endpoint is documented publicly; full API docs require authenticated portal access.',
    },
  ],
} as const
