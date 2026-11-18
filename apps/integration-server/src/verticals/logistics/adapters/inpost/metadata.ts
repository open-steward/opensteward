export const metadata = {
  platform: 'inpost',
  totalResources: 8,
  availableResources: ['carrier', 'label', 'manifest', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'order',
      reason:
        'InPost is a carrier-only platform with no order management concept or /orders endpoint; merchants manage orders in their own systems.',
    },
    {
      resource: 'rate',
      reason:
        'InPost does not expose a rate-quoting API; pricing is contractual and account managers provide rates outside the API (confirmed in official developer docs).',
    },
    {
      resource: 'warehouse',
      reason:
        'No current ShipX docs page documents a dispatch-point list or lookup; the only page that did ("[1.2.5] Dispatch points", GET /v1/organizations/:organization_id/dispatch_points) is archived',
    },
  ],
} as const
