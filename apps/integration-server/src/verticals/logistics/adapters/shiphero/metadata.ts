export const metadata = {
  platform: 'shiphero',
  totalResources: 8,
  availableResources: [
    'label',
    'order',
    'shipment',
    'warehouse',
  ],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'ShipHero confirmed no public GraphQL query for carriers; carrier management is UI-only (no listCarriers or getCarrier endpoint in the public API)',
    },
    {
      resource: 'manifest',
      reason:
        'No manifest or end-of-day query exists in ShipHero\'s public GraphQL API; manifests are not a supported concept in the API surface',
    },
    {
      resource: 'rate',
      reason:
        'ShipHero has no native rate-shopping endpoint; rates are obtained via external carrier APIs triggered by the Generate Label webhook, not through the public GraphQL API',
    },
    {
      resource: 'trackingevent',
      reason:
        'No tracking query, mutation or type exists in ShipHero\'s public GraphQL schema; tracking is scalar fields on ShippingLabel (tracking_number, tracking_url) and Shipment (tracking_status), with no per-event history to list',
    },
  ],
} as const
