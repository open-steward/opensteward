export const metadata = {
  platform: 'cargo-one',
  totalResources: 8,
  availableResources: ['carrier', 'label', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'manifest',
      reason:
        'UNVERIFIED: cargo.one API docs require partner authentication; public API surface covers only rates, booking/shipments, labels, carriers, and tracking — no manifest concept documented',
    },
    {
      resource: 'order',
      reason:
        'UNVERIFIED: cargo.one API docs require partner authentication; public API surface covers only rates, booking/shipments, labels, carriers, and tracking — no order concept documented',
    },
    {
      resource: 'warehouse',
      reason:
        'UNVERIFIED: cargo.one API docs require partner authentication; public API surface covers only rates, booking/shipments, labels, carriers, and tracking — no warehouse concept documented',
    },
  ],
} as const
