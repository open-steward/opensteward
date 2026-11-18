export const metadata = {
  platform: 'curri',
  totalResources: 8,
  availableResources: ['rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'Curri is the sole carrier; the GraphQL API exposes no carrier management queries or types.',
    },
    {
      resource: 'label',
      reason: 'No label query or list operation exists; the Appendix lists no Label type and the "Refund a Shipping Label" page is marked Coming Soon.',
    },
    {
      resource: 'manifest',
      reason: 'ManifestItem is an input-only type for delivery items; no standalone manifest resource or query is defined in the API.',
    },
    {
      resource: 'order',
      reason: 'Curri has no order concept; deliveries are the only bookable entity and are already covered under shipment.',
    },
    {
      resource: 'warehouse',
      reason: 'Curri exposes no warehouse or facility management queries; the API is purely delivery-dispatch focused.',
    },
  ],
} as const
