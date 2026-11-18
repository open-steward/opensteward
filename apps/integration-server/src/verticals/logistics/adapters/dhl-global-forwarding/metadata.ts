export const metadata = {
  platform: 'dhl-global-forwarding',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent', 'order'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'DHL Global Forwarding is a single carrier; no carrier-management API exists in the developer catalog',
    },
    {
      resource: 'label',
      reason: 'UNVERIFIED: Shipment Label API exists at developer.dhl.com but full endpoint paths and response schema are behind authenticated Swagger',
    },
    {
      resource: 'manifest',
      reason: 'No manifest API in the DHL Global Forwarding developer catalog',
    },
    {
      resource: 'rate',
      reason: 'No rate/quote developer API; myDHLi Quote+Book is a UI tool only, not an API',
    },
    {
      resource: 'warehouse',
      reason: 'No warehouse API in the DHL Global Forwarding developer catalog',
    },
  ],
} as const
