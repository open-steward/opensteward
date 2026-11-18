export const metadata = {
  platform: 'pandago',
  totalResources: 8,
  availableResources: ['order', 'rate', 'shipment', 'trackingevent', 'warehouse'],
  unavailableResources: [
    { resource: 'carrier', reason: 'pandago is itself a single courier; no carriers endpoint exists in the API' },
    { resource: 'label', reason: 'on-demand service; shipping labels are not applicable' },
    { resource: 'manifest', reason: 'not applicable for last-mile on-demand delivery' },
  ],
} as const
