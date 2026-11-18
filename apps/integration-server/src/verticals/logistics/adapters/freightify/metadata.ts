export const metadata = {
  platform: 'freightify',
  totalResources: 8,
  availableResources: ['rate', 'shipment'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'UNVERIFIED: Freightify references 30+ ocean carriers in rate results but has no documented /carriers listing endpoint; API docs require a paid account/sandbox login to access in full',
    },
    {
      resource: 'label',
      reason:
        'Freightify is an ocean freight rate management platform and does not generate parcel shipping labels',
    },
    {
      resource: 'manifest',
      reason:
        'Freightify does not provide shipment manifests; the platform scope is rate procurement, sailing schedules, and container tracking only',
    },
    {
      resource: 'order',
      reason:
        'Freightify has no order management concept; freight bookings are already mapped as shipments',
    },
    {
      resource: 'warehouse',
      reason:
        'Freightify has no warehouse management functionality; it is a rate management and ocean freight visibility platform',
    },
    {
      resource: 'trackingevent',
      reason:
        'Its public API documents only per-container and per-BL lookups (GET /v1/track/container/{containerId} and GET /v1/track/bl/{blNumber}), with no event collection',
    },
  ],
} as const
