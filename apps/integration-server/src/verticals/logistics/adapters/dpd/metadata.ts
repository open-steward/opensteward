export const metadata = {
  platform: 'dpd',
  totalResources: 8,
  availableResources: [
    'carrier',
    'label',
    'manifest',
    'shipment',
    'trackingevent',
  ],
  unavailableResources: [
    { resource: 'order', reason: 'DPD is a pure carrier; no order management concept or endpoint exists in their API' },
    { resource: 'rate', reason: 'DPD UK does not provide a Rates API; confirmed absent in official integration documentation' },
    { resource: 'warehouse', reason: 'DPD does not expose depot or warehouse resources via their REST API' },
  ],
} as const
