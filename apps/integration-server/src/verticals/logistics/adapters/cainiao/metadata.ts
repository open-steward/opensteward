export const metadata = {
  platform: 'cainiao',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent', 'rate'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'UNVERIFIED: Cainiao API docs are behind an authenticated portal (open.cainiao.com renders only a loading screen; global.link.cainiao.com/gateway/ redirects to login); no public endpoint confirmed',
    },
    {
      resource: 'label',
      reason: 'UNVERIFIED: Cainiao API docs are behind an authenticated portal (open.cainiao.com renders only a loading screen; global.link.cainiao.com/gateway/ redirects to login); no public endpoint confirmed',
    },
    {
      resource: 'manifest',
      reason: 'UNVERIFIED: Cainiao API docs are behind an authenticated portal (open.cainiao.com renders only a loading screen; global.link.cainiao.com/gateway/ redirects to login); no public endpoint confirmed',
    },
    {
      resource: 'order',
      reason: 'UNVERIFIED: Cainiao API docs are behind an authenticated portal (open.cainiao.com renders only a loading screen; global.link.cainiao.com/gateway/ redirects to login); no public endpoint confirmed',
    },
    {
      resource: 'warehouse',
      reason: 'UNVERIFIED: Cainiao API docs are behind an authenticated portal (open.cainiao.com renders only a loading screen; global.link.cainiao.com/gateway/ redirects to login); no public endpoint confirmed',
    },
  ],
} as const
