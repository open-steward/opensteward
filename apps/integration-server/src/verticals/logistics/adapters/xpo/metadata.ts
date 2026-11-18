export const metadata = {
  platform: 'xpo',
  totalResources: 8,
  availableResources: ['carrier', 'label', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'manifest',
      reason: 'XPO manifest reports are portal-only (Reports section in LTL.xpo.com); no REST API endpoint exists',
    },
    {
      resource: 'order',
      reason: 'XPO is an LTL freight carrier with no order management concept; pickup requests map to shipments, not orders',
    },
    {
      resource: 'warehouse',
      reason: 'XPO has no warehouse management API; service centers are not exposed as warehouses via the LTL API',
    },
  ],
} as const
