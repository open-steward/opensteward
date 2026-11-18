export const metadata = {
  platform: 'descartes',
  totalResources: 8,
  availableResources: ['trackingevent', 'shipment'],
  unavailableResources: [
    { resource: 'carrier', reason: 'UNVERIFIED: Descartes API portal (api.descartes.com) requires authentication; no public documentation confirms a /carriers endpoint' },
    { resource: 'label', reason: 'UNVERIFIED: Descartes API portal (api.descartes.com) requires authentication; no public documentation confirms a /labels endpoint' },
    { resource: 'manifest', reason: 'UNVERIFIED: Descartes API portal (api.descartes.com) requires authentication; no public documentation confirms a /manifests endpoint' },
    { resource: 'order', reason: 'UNVERIFIED: Descartes API portal (api.descartes.com) requires authentication; no public documentation confirms an /orders endpoint' },
    { resource: 'rate', reason: 'UNVERIFIED: Descartes API portal (api.descartes.com) requires authentication; no public documentation confirms a /rates endpoint' },
    { resource: 'warehouse', reason: 'UNVERIFIED: Descartes API portal (api.descartes.com) requires authentication; no public documentation confirms a /warehouses endpoint' },
  ],
} as const
