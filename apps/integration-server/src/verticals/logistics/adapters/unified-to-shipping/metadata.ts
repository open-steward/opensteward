export const metadata = {
  platform: 'unified-to-shipping',
  totalResources: 8,
  availableResources: ['carrier', 'label', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'manifest',
      reason:
        'Unified.to Shipping API has no manifest endpoint. The vertical exposes only Shipment, Label, Rate, Tracking, and Carrier resources.',
    },
    {
      resource: 'order',
      reason:
        'Unified.to Shipping API has no order endpoint. The order_id field appears only as a reference field on Shipment objects, not as a standalone resource.',
    },
    {
      resource: 'warehouse',
      reason:
        'Unified.to Shipping API has no warehouse endpoint. The warehouse_location_id field appears only as a reference field on Shipment objects, not as a standalone resource.',
    },
  ],
} as const
