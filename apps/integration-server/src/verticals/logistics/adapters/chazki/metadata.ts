export const metadata = {
  platform: 'chazki',
  totalResources: 8,
  availableResources: [
    'label',
    'order',
    'rate',
    'shipment',
    'trackingevent',
  ],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'Chazki is a single-carrier platform; the Peru Legacy API exposes no carrier directory endpoint.',
    },
    {
      resource: 'manifest',
      reason:
        'No manifest creation or retrieval endpoint exists in any Chazki API variant.',
    },
    {
      resource: 'warehouse',
      reason:
        'The deprecated Maximo Chile API has a /cloud/warehouses/ endpoint but it uses a different base URL and auth scheme incompatible with this adapter; the Peru Legacy API has no warehouse endpoint.',
    },
  ],
} as const
