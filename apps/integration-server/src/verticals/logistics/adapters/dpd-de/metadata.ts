export const metadata = {
  platform: 'dpd-de',
  totalResources: 8,
  availableResources: ['carrier', 'label', 'shipment', 'trackingevent'],
  unavailableResources: [
    { resource: 'manifest', reason: 'DPD Germany does not require manifesting; no manifest API endpoint exists (confirmed by ShipEngine DPD Germany carrier guide)' },
    { resource: 'order', reason: 'DPD DE is a parcel carrier with no order management concept or API endpoint' },
    { resource: 'rate', reason: 'DPD Germany does not support rate shopping via API — no rates endpoint provided (confirmed by ShipEngine carrier guide)' },
    { resource: 'warehouse', reason: 'DPD DE has no depot or warehouse listing endpoint in its published API' },
  ],
} as const
