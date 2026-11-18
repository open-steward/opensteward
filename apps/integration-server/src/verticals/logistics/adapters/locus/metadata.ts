export const metadata = {
  platform: 'locus',
  totalResources: 8,
  availableResources: ['trackingevent', 'shipment'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'UNVERIFIED: Locus API docs require client credentials (401); no public endpoint confirmed for carriers',
    },
    {
      resource: 'label',
      reason: 'UNVERIFIED: Locus API docs require client credentials (401); label/manifest endpoints exist per partner docs but paths and response shapes are not publicly documented',
    },
    {
      resource: 'manifest',
      reason: 'UNVERIFIED: Locus API docs require client credentials (401); manifest endpoints exist per partner docs but paths and response shapes are not publicly documented',
    },
    {
      resource: 'order',
      reason: 'UNVERIFIED: Locus API docs require client credentials (401); order management runs on a separate base (oms.locus-api.com) with unconfirmed response schema',
    },
    {
      resource: 'rate',
      reason: 'UNVERIFIED: Locus API docs require client credentials (401); no public endpoint confirmed for rate quotes',
    },
    {
      resource: 'warehouse',
      reason: 'UNVERIFIED: Locus API docs require client credentials (401); no public endpoint confirmed for warehouses/hubs',
    },
  ],
} as const
