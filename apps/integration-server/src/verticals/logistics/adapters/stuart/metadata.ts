export const metadata = {
  platform: 'stuart',
  totalResources: 8,
  availableResources: ['rate', 'shipment', 'trackingevent', 'order'],
  unavailableResources: [
    { resource: 'carrier', reason: 'Stuart dispatches its own on-demand couriers; no carrier listing endpoint exists in the API' },
    { resource: 'label', reason: 'Stuart does not issue shipping labels; on-demand couriers collect packages directly without labels' },
    { resource: 'manifest', reason: 'Stuart has no manifest concept; jobs are individual on-demand dispatches, not batched' },
    { resource: 'warehouse', reason: 'Stuart has no warehouse management; pickup addresses are specified per-job and not managed as warehouses' },
  ],
} as const
