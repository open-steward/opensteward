export const metadata = {
  platform: 'naqel',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent', 'label'],
  unavailableResources: [
    { resource: 'carrier', reason: 'Naqel is a single-carrier platform; no carrier-listing endpoint exists in any API version' },
    { resource: 'rate', reason: 'UNVERIFIED: SOAP API exposes GetRate but the v2 REST API base used by this adapter has no public docs confirming a /rates endpoint' },
    { resource: 'order', reason: 'UNVERIFIED: SOAP API exposes GetPickupOrders but the v2 REST API base has no public docs confirming an /orders endpoint' },
    { resource: 'manifest', reason: 'UNVERIFIED: SOAP API exposes GetDispatchInfo but the v2 REST API base has no public docs confirming a /manifests endpoint' },
    { resource: 'warehouse', reason: 'UNVERIFIED: no warehouse endpoint found in any Naqel API version; full API docs are behind login' },
  ],
} as const
