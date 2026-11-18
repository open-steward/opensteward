export const metadata = {
  platform: 'globegistics',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent'],
  unavailableResources: [
    { resource: 'carrier', reason: 'Globegistics is a single-carrier postal service; no carrier list endpoint exists in their API' },
    { resource: 'label', reason: 'UNVERIFIED: Globegistics supports labels (confirmed via Shippo carrier capabilities) but native API docs are behind authentication — exact endpoint and field names cannot be confirmed' },
    { resource: 'manifest', reason: 'UNVERIFIED: Globegistics supports manifests (confirmed via Shippo carrier capabilities) but native API docs are behind authentication — exact endpoint and field names cannot be confirmed' },
    { resource: 'order', reason: 'Globegistics is a carrier/postal service; no order management endpoints exist in their API' },
    { resource: 'rate', reason: 'UNVERIFIED: Globegistics supports rate quoting (confirmed via Shippo carrier capabilities) but native API docs are behind authentication — exact endpoint and field names cannot be confirmed' },
    { resource: 'warehouse', reason: 'Globegistics is a carrier/postal service; no warehouse management endpoints exist in their API' },
  ],
} as const
