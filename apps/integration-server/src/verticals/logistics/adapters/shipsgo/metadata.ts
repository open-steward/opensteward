export const metadata = {
  platform: 'shipsgo',
  totalResources: 8,
  availableResources: ['carrier', 'shipment', 'trackingevent'],
  unavailableResources: [
    { resource: 'label', reason: 'ShipsGo is a container-tracking API only; no label printing or generation endpoints exist in the v2 API' },
    { resource: 'manifest', reason: 'ShipsGo has no manifest or SCAN-form concept; no manifest endpoints exist in the v2 API' },
    { resource: 'order', reason: 'ShipsGo is not an order management system; no order endpoints exist in the v2 API' },
    { resource: 'rate', reason: 'ShipsGo does not provide freight rate quoting; no rate endpoints exist in the v2 API' },
    { resource: 'warehouse', reason: 'ShipsGo has no warehouse management concept; no warehouse endpoints exist in the v2 API' },
  ],
} as const
