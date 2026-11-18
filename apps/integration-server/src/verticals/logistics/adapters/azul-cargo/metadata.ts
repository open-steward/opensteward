export const metadata = {
  platform: 'azul-cargo',
  totalResources: 8,
  availableResources: ['trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'UNVERIFIED: Azul Cargo Express API docs are behind a closed partner portal; no public endpoint confirmed for carrier listing',
    },
    {
      resource: 'label',
      reason:
        'UNVERIFIED: Azul Cargo Express API docs are behind a closed partner portal; no public endpoint confirmed for label creation or retrieval',
    },
    {
      resource: 'manifest',
      reason:
        'UNVERIFIED: Azul Cargo Express API docs are behind a closed partner portal; no public endpoint confirmed for manifests',
    },
    {
      resource: 'order',
      reason:
        'UNVERIFIED: Azul Cargo Express API docs are behind a closed partner portal; no public endpoint confirmed for order management',
    },
    {
      resource: 'rate',
      reason:
        'UNVERIFIED: Azul Cargo Express API docs are behind a closed partner portal; freight quoting is referenced in third-party integration guides but endpoint shape is undocumented',
    },
    {
      resource: 'shipment',
      reason:
        'UNVERIFIED: Azul Cargo Express API docs are behind a closed partner portal; no public endpoint confirmed for shipment CRUD',
    },
    {
      resource: 'warehouse',
      reason:
        'UNVERIFIED: Azul Cargo Express API docs are behind a closed partner portal; no public endpoint confirmed for warehouse listing',
    },
  ],
} as const
