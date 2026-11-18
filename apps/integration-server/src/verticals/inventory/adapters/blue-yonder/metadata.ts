export const metadata = {
  platform: 'blue-yonder',
  totalResources: 7,
  availableResources: ['purchase-order', 'stock-level'],
  unavailableResources: [
    {
      resource: 'location',
      reason:
        'UNVERIFIED: Blue Yonder WMS REST API docs are enterprise-gated; no public endpoint for warehouse locations confirmed',
    },
    {
      resource: 'product',
      reason:
        'UNVERIFIED: Blue Yonder WMS REST API docs are enterprise-gated; no public items/products endpoint confirmed',
    },
    {
      resource: 'stock-adjustment',
      reason:
        'UNVERIFIED: Blue Yonder WMS REST API docs are enterprise-gated; no public adjustments endpoint confirmed',
    },
    {
      resource: 'stock-transfer',
      reason:
        'UNVERIFIED: Blue Yonder WMS REST API docs are enterprise-gated; no public transfers endpoint confirmed',
    },
    {
      resource: 'supplier',
      reason:
        'UNVERIFIED: Blue Yonder WMS REST API docs are enterprise-gated; no public suppliers endpoint confirmed',
    },
  ],
} as const
