export const metadata = {
  platform: 'kitchenhub',
  totalResources: 8,
  availableResources: ['carrier', 'order', 'rate', 'shipment', 'warehouse'],
  unavailableResources: [
    {
      resource: 'label',
      reason:
        'KitchenHub is a restaurant order-aggregation platform (food delivery marketplace connector). Its API exposes Deliveries, Quotes, Orders, Stores, Menu, Providers, and Webhooks — no shipping-label concept or endpoint exists.',
    },
    {
      resource: 'manifest',
      reason:
        'KitchenHub is a restaurant order-aggregation platform (food delivery marketplace connector). Its API exposes Deliveries, Quotes, Orders, Stores, Menu, Providers, and Webhooks — no carrier manifest concept or endpoint exists.',
    },
    {
      resource: 'trackingevent',
      reason:
        'A delivery carries only its current status ("Current delivery status"), and no endpoint returns a status history or looks a delivery up by tracking number',
    },
  ],
} as const
