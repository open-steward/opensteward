export const metadata = {
  platform: 'shipengine',
  totalResources: 8,
  availableResources: [
    'carrier',
    'label',
    'manifest',
    'rate',
    'shipment',
    'trackingevent',
    'warehouse',
  ],
  unavailableResources: [
    {
      resource: 'order',
      reason:
        'ShipEngine v1 REST API has no orders resource or /orders endpoint; order data is only referenced via the external_order_id field on shipments and labels.',
    },
  ],
} as const
