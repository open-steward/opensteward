export const metadata = {
  platform: 'shipsy',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'UNVERIFIED: Shipsy API docs are behind authentication (apiplayground.shipsy.in returns 403); no public endpoint for carriers confirmed.',
    },
    {
      resource: 'label',
      reason:
        'UNVERIFIED: Shipsy API docs are behind authentication (apiplayground.shipsy.in returns 403); no public endpoint for labels confirmed.',
    },
    {
      resource: 'manifest',
      reason:
        'UNVERIFIED: Shipsy API docs are behind authentication (apiplayground.shipsy.in returns 403); no public endpoint for manifests confirmed.',
    },
    {
      resource: 'order',
      reason:
        'UNVERIFIED: Shipsy API docs are behind authentication (apiplayground.shipsy.in returns 403); no public endpoint for orders confirmed.',
    },
    {
      resource: 'rate',
      reason:
        'UNVERIFIED: Shipsy API docs are behind authentication (apiplayground.shipsy.in returns 403); no public endpoint for rates confirmed.',
    },
    {
      resource: 'warehouse',
      reason:
        'UNVERIFIED: Shipsy API docs are behind authentication (apiplayground.shipsy.in returns 403); no public endpoint for warehouses confirmed.',
    },
  ],
} as const
