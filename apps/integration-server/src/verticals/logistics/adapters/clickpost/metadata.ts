export const metadata = {
  platform: 'clickpost',
  totalResources: 8,
  availableResources: [
    'carrier',
    'label',
    'manifest',
    'order',
    'rate',
    'shipment',
    'trackingevent',
  ],
  unavailableResources: [
    {
      resource: 'warehouse',
      reason:
        'ClickPost has no dedicated warehouse management endpoint; pickup location data exists only as embedded fields (vendor_code, from_wh, pickup_type) within order creation payloads.',
    },
  ],
} as const
