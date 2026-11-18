export const metadata = {
  platform: 'dtdc',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent', 'rate', 'label'],
  unavailableResources: [
    { resource: 'carrier', reason: 'DTDC is a single courier; no carrier-listing endpoint exists in their API' },
    { resource: 'order', reason: 'DTDC is a courier/carrier only and has no order-management API' },
    { resource: 'warehouse', reason: 'DTDC has no documented warehouse-management endpoint' },
    { resource: 'manifest', reason: 'UNVERIFIED: DTDC references a manifest API but endpoint details are behind authenticated login walls; cannot confirm request/response shape' },
  ],
} as const
