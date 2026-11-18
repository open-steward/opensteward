export const metadata = {
  platform: 'dhl-parcel-bnl',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent', 'label'],
  unavailableResources: [
    { resource: 'carrier', reason: 'DHL Parcel BNL is itself the carrier; no /carriers endpoint exists in the api-gw.dhlparcel.nl API' },
    { resource: 'manifest', reason: 'No manifest endpoint in the api-gw.dhlparcel.nl API; DHL Parcel DE has one but BNL does not' },
    { resource: 'order', reason: 'No order management endpoint in the BNL API; shipments are created directly via /labels or /shipments' },
    { resource: 'rate', reason: 'The /capabilities endpoint returns service availability and option validation only, not pricing or rate quotes' },
    { resource: 'warehouse', reason: 'DHL manages its own pickup and delivery infrastructure; no /warehouses endpoint exists in the BNL API' },
  ],
} as const
