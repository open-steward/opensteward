export const metadata = {
  platform: 'janio',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent', 'order', 'label'],
  unavailableResources: [
    { resource: 'carrier', reason: 'Janio is a single-carrier platform; there is no carrier list endpoint' },
    { resource: 'warehouse', reason: 'Janio is a cross-border carrier, not a WMS; no warehouse management API exists' },
    { resource: 'rate', reason: 'UNVERIFIED: apidocs.janio.asia is a JS SPA with an invalid TLS cert; could not confirm whether a rate calculation endpoint exists' },
    { resource: 'manifest', reason: 'UNVERIFIED: apidocs.janio.asia is a JS SPA with an invalid TLS cert; could not confirm whether a manifest endpoint exists' },
  ],
} as const
