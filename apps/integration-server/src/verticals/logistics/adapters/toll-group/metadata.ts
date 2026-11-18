export const metadata = {
  platform: 'toll-group',
  totalResources: 8,
  availableResources: ['rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'UNVERIFIED: Toll Group API docs are behind the apps.tollgroup.com authenticated portal (SSL cert blocks public fetch); no publicly documented carrier-listing endpoint found',
    },
    {
      resource: 'label',
      reason:
        'UNVERIFIED: Toll Group API docs are behind the apps.tollgroup.com authenticated portal (SSL cert blocks public fetch); no publicly documented label endpoint found',
    },
    {
      resource: 'manifest',
      reason:
        'UNVERIFIED: Toll Group API docs are behind the apps.tollgroup.com authenticated portal (SSL cert blocks public fetch); no publicly documented manifest endpoint found',
    },
    {
      resource: 'order',
      reason:
        'UNVERIFIED: Toll Group API docs are behind the apps.tollgroup.com authenticated portal (SSL cert blocks public fetch); no publicly documented order endpoint found',
    },
    {
      resource: 'warehouse',
      reason:
        'UNVERIFIED: Toll Group API docs are behind the apps.tollgroup.com authenticated portal (SSL cert blocks public fetch); no publicly documented warehouse endpoint found',
    },
  ],
} as const
