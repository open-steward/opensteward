export const metadata = {
  platform: 'onfleet',
  totalResources: 8,
  availableResources: [
    'shipment',
    'trackingevent',
    'order',
    'warehouse',
  ],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'Onfleet is the courier network itself; no external carrier catalog endpoint exists in the API',
    },
    {
      resource: 'label',
      reason: 'Onfleet dispatches tasks via its driver app, not shipping labels; no label generation or retrieval endpoint exists',
    },
    {
      resource: 'manifest',
      reason: 'The worker route delivery manifest (GET workers/{id}/deliveryManifest) is a per-driver route document scoped to a single worker and date, not a carrier-submission manifest; no list/get manifest API exists',
    },
    {
      resource: 'rate',
      reason: 'Onfleet is a last-mile dispatch platform and does not calculate shipping rates; no rate endpoint exists',
    },
  ],
} as const
