export const metadata = {
  platform: 'colissimo',
  totalResources: 8,
  availableResources: ['rate', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'Colissimo (La Poste) is itself the single carrier; the Okapi Suivi v2 API exposes no carrier list endpoint.',
    },
    {
      resource: 'label',
      reason: 'Label generation requires the separate SLS API (ws.colissimo.fr) which uses contractNumber/password auth incompatible with this adapter\'s X-Okapi-Key scheme.',
    },
    {
      resource: 'manifest',
      reason: 'Manifest/bordereau generation requires the separate SLS API (ws.colissimo.fr) which uses contractNumber/password auth incompatible with this adapter\'s X-Okapi-Key scheme.',
    },
    {
      resource: 'order',
      reason: 'Colissimo has no order management concept; the Okapi Suivi v2 API is a shipping-label and tracking service only.',
    },
    {
      resource: 'shipment',
      reason: 'The Okapi Suivi v2 API has no shipment list or get endpoint; it only supports per-tracking-number lookup via getTrackingEvents.',
    },
    {
      resource: 'warehouse',
      reason: 'Colissimo has no warehouse management concept in any of its public APIs.',
    },
  ],
} as const
