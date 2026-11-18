export const metadata = {
  platform: 'turvo',
  totalResources: 8,
  availableResources: ['shipment', 'order', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'UNVERIFIED: Turvo manages carrier relationships internally but carrier-management API endpoints are not publicly documented; API docs require authentication at app.turvo.com/lobby/documentation',
    },
    {
      resource: 'warehouse',
      reason: 'UNVERIFIED: Turvo can connect to WMS systems but a dedicated warehouse-management REST endpoint is not publicly documented; API docs require authentication at app.turvo.com/lobby/documentation',
    },
    {
      resource: 'rate',
      reason: 'UNVERIFIED: Turvo integrates with external rating engines (e.g. SMC3) but a native rate-quote REST endpoint is not publicly documented; API docs require authentication at app.turvo.com/lobby/documentation',
    },
    {
      resource: 'label',
      reason: 'Turvo is a freight TMS/broker platform, not a parcel carrier; it does not generate or host PDF/ZPL shipping labels',
    },
    {
      resource: 'manifest',
      reason: 'Turvo is a freight TMS/broker platform, not a parcel carrier; end-of-day manifests are a parcel-carrier concept not present in the Turvo TMS domain',
    },
  ],
} as const
