export const metadata = {
  platform: 'dhl-africa',
  totalResources: 8,
  availableResources: ['rate', 'shipment', 'trackingevent', 'label'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'DHL Africa is itself the single carrier; the API has no carrier-enumeration endpoint',
    },
    {
      resource: 'manifest',
      reason: 'UNVERIFIED: no public docs confirm a manifest endpoint under api.dhl.com/africa/v1/',
    },
    {
      resource: 'order',
      reason: 'DHL Africa is a carrier API and has no order-management concept or endpoint',
    },
    {
      resource: 'warehouse',
      reason: 'DHL carrier API does not expose warehouse locations via any documented endpoint',
    },
  ],
} as const
