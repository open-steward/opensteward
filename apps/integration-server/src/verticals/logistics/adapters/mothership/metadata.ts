export const metadata = {
  platform: 'mothership',
  totalResources: 8,
  availableResources: [
    'rate',
    'shipment',
    'trackingevent',
    'label',
  ],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'Mothership exposes carriers only as a static SCAC lookup table embedded in quote responses; no /carriers endpoint exists.',
    },
    {
      resource: 'manifest',
      reason: 'Mothership has no manifest concept or endpoint in its API.',
    },
    {
      resource: 'order',
      reason:
        'Mothership has no order management in its API; shipments are booked directly from quotes.',
    },
    {
      resource: 'warehouse',
      reason:
        'The deprecated /places endpoints are address-lookup utilities, not warehouse management; no warehouse endpoint exists.',
    },
  ],
} as const
