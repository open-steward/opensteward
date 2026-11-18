export const metadata = {
  platform: 'ups',
  totalResources: 8,
  availableResources: ['carrier', 'label', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'manifest',
      reason:
        'UPS shipments are automatically manifested upon creation; the UPS developer portal (github.com/UPS-API/api-documentation) contains no dedicated Manifest REST API.',
    },
    {
      resource: 'order',
      reason:
        'UPS has no Order Management REST API; UPS is a carrier, not an order management platform.',
    },
    {
      resource: 'warehouse',
      reason:
        'UPS has no merchant-warehouse REST API; the Pickup API servicecenterlocations endpoint returns UPS facility drop-off/pickup points, not customer warehouses.',
    },
  ],
} as const
