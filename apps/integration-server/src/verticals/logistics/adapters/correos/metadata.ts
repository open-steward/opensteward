export const metadata = {
  platform: 'correos',
  totalResources: 8,
  availableResources: ['rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'Correos is a single-carrier postal service; no carrier discovery endpoint exists.',
    },
    {
      resource: 'label',
      reason:
        'UNVERIFIED: Labels API is confirmed on the Correos MuleSoft portal but endpoint paths and response field names require an authenticated developer portal account with a signed transport contract.',
    },
    {
      resource: 'manifest',
      reason:
        'Correos API does not expose a manifests endpoint; documented modules are preregister, labels, pickup requests, and trackpub only.',
    },
    {
      resource: 'order',
      reason:
        'UNVERIFIED: Orders API is listed on the Correos MuleSoft portal but endpoint paths and response field names require an authenticated developer portal account with a signed transport contract.',
    },
    {
      resource: 'warehouse',
      reason:
        'UNVERIFIED: Warehouse API is listed on the Correos MuleSoft portal but endpoint paths and response field names require an authenticated developer portal account with a signed transport contract.',
    },
  ],
} as const
