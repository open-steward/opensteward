export const metadata = {
  platform: 'gophr-uk',
  totalResources: 8,
  availableResources: ['rate', 'shipment', 'trackingevent', 'label'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'Gophr V2 Commercial API has no carrier management endpoints; it is a single-carrier service (Gophr itself) with no carrier listing or lookup resource',
    },
    {
      resource: 'manifest',
      reason:
        'Gophr V2 Commercial API has no manifest or end-of-day close endpoints; the three documented resources are Jobs, Deliveries, and Parcels',
    },
    {
      resource: 'order',
      reason:
        'Gophr V2 Commercial API has no order management resource; dispatch is done via Jobs (shipments) with no separate order concept',
    },
    {
      resource: 'warehouse',
      reason:
        'Gophr V2 Commercial API has no warehouse or hub management endpoints; pickup addresses are specified per-job, not managed as standing warehouses',
    },
  ],
} as const
