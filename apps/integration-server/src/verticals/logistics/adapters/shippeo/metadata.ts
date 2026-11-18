export const metadata = {
  platform: 'shippeo',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'Shippeo is a pure transport-visibility platform; it has no carrier-directory endpoint. carrier_code appears only as a field on shipment/tracking responses.',
    },
    {
      resource: 'label',
      reason:
        'Shippeo does not generate shipping labels; it tracks shipments created elsewhere.',
    },
    {
      resource: 'manifest',
      reason:
        'Shippeo has no manifest or end-of-day pickup concept; it is not a transactional shipping system.',
    },
    {
      resource: 'order',
      reason:
        'Shippeo has no order-management capability; it is focused exclusively on visibility and tracking.',
    },
    {
      resource: 'rate',
      reason:
        'Shippeo does not offer rate shopping or carrier pricing; it is not a rating/quoting system.',
    },
    {
      resource: 'warehouse',
      reason:
        'Shippeo has no warehouse-management or location-directory endpoints; it is not a WMS.',
    },
  ],
} as const
