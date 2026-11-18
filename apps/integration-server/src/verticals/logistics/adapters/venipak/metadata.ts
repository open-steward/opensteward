export const metadata = {
  platform: 'venipak',
  totalResources: 8,
  availableResources: [
    'label',
    'manifest',
    'shipment',
    'trackingevent',
    'warehouse',
  ],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'Venipak is itself the single carrier; the API exposes no carrier-list endpoint',
    },
    {
      resource: 'order',
      reason:
        'Venipak has no order management concept or endpoint; the API is shipment/label-only',
    },
    {
      resource: 'rate',
      reason:
        'ws/get_route returns delivery zone routing data, not price quotes; no rate/pricing endpoint exists in the native API',
    },
  ],
} as const
