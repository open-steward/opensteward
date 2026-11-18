export const metadata = {
  platform: 'gls-de',
  totalResources: 8,
  availableResources: [
    'carrier',
    'label',
    'manifest',
    'shipment',
    'trackingevent',
  ],
  unavailableResources: [
    { resource: 'order',     reason: 'GLS-DE is a carrier-only service; no order management concept or endpoint exists in the ShipIT API' },
    { resource: 'rate',      reason: 'getAllowedServices returns service codes only (no pricing data); no rate/quote endpoint exists in the ShipIT API' },
    { resource: 'warehouse', reason: 'No warehouse or depot management endpoint; ParcelShop search endpoints return customer pickup-point locations only' },
  ],
} as const
