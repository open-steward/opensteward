export const metadata = {
  platform: 'fourkites',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'UNVERIFIED: FourKites developer portal is behind authentication; no public endpoint for listing carriers confirmed in any accessible documentation. The platform is a visibility tool, not a carrier directory.',
    },
    {
      resource: 'label',
      reason: 'FourKites is a supply chain visibility platform, not a parcel carrier or label-printing service; it has no label-generation capability in its public API.',
    },
    {
      resource: 'manifest',
      reason: 'FourKites is a supply chain visibility platform, not a parcel carrier; it has no manifest-creation capability in its public API.',
    },
    {
      resource: 'order',
      reason: 'UNVERIFIED: FourKites developer portal is behind authentication; Order Intelligence is a UI product and no public REST endpoint for orders was found in accessible documentation.',
    },
    {
      resource: 'rate',
      reason: 'FourKites is a supply chain visibility platform, not a TMS or multi-carrier rating engine; it has no rate-shopping capability in its public API.',
    },
    {
      resource: 'warehouse',
      reason: 'UNVERIFIED: FourKites Dynamic Yard product may expose facility data but the API is behind authentication and no public warehouse endpoint was confirmed in accessible documentation.',
    },
  ],
} as const
