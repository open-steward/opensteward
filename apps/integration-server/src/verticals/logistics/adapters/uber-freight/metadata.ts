export const metadata = {
  platform: 'uber-freight',
  totalResources: 8,
  availableResources: ['rate', 'shipment', 'trackingevent', 'order'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'Uber Freight is the sole carrier/broker; no /carriers list endpoint exists in their API',
    },
    {
      resource: 'label',
      reason: 'Uber Freight is a freight brokerage, not a parcel carrier; no label issuance or /labels endpoint is documented',
    },
    {
      resource: 'manifest',
      reason: 'No manifest concept or endpoint is documented for freight brokerage operations',
    },
    {
      resource: 'warehouse',
      reason: 'UNVERIFIED: Scheduling/facility API exists but a /warehouses list endpoint is not confirmed; full API docs are behind a registration wall',
    },
  ],
} as const
