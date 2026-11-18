export const metadata = {
  platform: 'extensiv',
  totalResources: 8,
  availableResources: ['carrier', 'order', 'shipment', 'trackingevent', 'warehouse'],
  unavailableResources: [
    {
      resource: 'label',
      reason:
        'No dedicated label endpoint in the 3PL Warehouse Manager REST API; label URLs are embedded in shipment records as `labelUrl`. Label creation requires the separate Extensiv Parcel API product.',
    },
    {
      resource: 'manifest',
      reason:
        'No manifest endpoint in the 3PL Warehouse Manager REST API; manifesting is a UI-only workflow or a feature of the separate Extensiv Parcel API product.',
    },
    {
      resource: 'rate',
      reason:
        'No rate-shopping endpoint in the 3PL Warehouse Manager REST API; rate selection is handled via the WMS UI or the separate Extensiv Parcel API product.',
    },
  ],
} as const
