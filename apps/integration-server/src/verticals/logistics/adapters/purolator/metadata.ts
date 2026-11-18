export const metadata = {
  platform: 'purolator',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent', 'rate', 'label', 'manifest'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'Purolator is a single carrier and exposes no carrier-list endpoint; services are returned per-shipment via ServiceAvailabilityService, not as a carrier registry',
    },
    {
      resource: 'order',
      reason: 'Purolator has no order-management concept in its API; the platform is a shipping carrier only (Shipping, Estimating, Tracking, Documents, Pickups, Returns services only)',
    },
    {
      resource: 'warehouse',
      reason: 'Purolator exposes no warehouse or depot-list endpoint in its E-Ship Web Services API',
    },
  ],
} as const
