export const metadata = {
  platform: 'usps',
  totalResources: 8,
  availableResources: ['label', 'manifest', 'rate', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'USPS is a single carrier; no carrier-listing endpoint exists in the USPS REST API',
    },
    {
      resource: 'order',
      reason: 'USPS has no order-management concept or endpoint',
    },
    {
      resource: 'shipment',
      reason: 'USPS REST API has no shipment CRUD endpoint — labels are the unit of dispatch',
    },
    {
      resource: 'warehouse',
      reason: 'USPS has no warehouse or origin-location management endpoint',
    },
  ],
} as const
