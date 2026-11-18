export const metadata = {
  platform: 'samsara',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'Samsara is a fleet telematics platform with no carrier/parcel-carrier concept or endpoint; its API covers routes, vehicles, drivers, and compliance only.',
    },
    {
      resource: 'label',
      reason:
        'Samsara does not issue or store shipping labels; no label endpoint exists in the Samsara REST API.',
    },
    {
      resource: 'manifest',
      reason:
        'Samsara has no end-of-day shipment manifest concept or endpoint; the platform does not support parcel manifesting.',
    },
    {
      resource: 'order',
      reason:
        'Samsara has no order management endpoint; the Samsara REST API does not expose customer or fulfillment orders.',
    },
    {
      resource: 'rate',
      reason:
        'Samsara does not provide shipping rate quoting; it is a telematics platform with no rate/quote endpoint.',
    },
    {
      resource: 'warehouse',
      reason:
        'Samsara has no warehouse resource; its Addresses API describes geofenced fleet locations, not warehouse management entities.',
    },
  ],
} as const
