export const metadata = {
  platform: 'yodel',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'Yodel exposes no carrier listing endpoint; it is itself the single carrier.',
    },
    {
      resource: 'manifest',
      reason: 'Yodel automatically manifests all shipments; no manifest create/list endpoint exists.',
    },
    {
      resource: 'warehouse',
      reason: 'Yodel has no warehouse concept or warehouse API endpoints.',
    },
    {
      resource: 'order',
      reason: 'UNVERIFIED: Yodel\'s Shipping - Orders API exists but specific response field names are behind a login-gated developer portal and could not be confirmed.',
    },
    {
      resource: 'rate',
      reason: 'UNVERIFIED: Yodel\'s Shipping - Schedule API exists but specific endpoint paths and response field names are behind a login-gated developer portal and could not be confirmed.',
    },
    {
      resource: 'label',
      reason: 'UNVERIFIED: Labels are embedded in Yodel\'s Orders API response, but specific field names and endpoint paths are behind a login-gated developer portal and could not be confirmed.',
    },
  ],
} as const
