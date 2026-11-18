export const metadata = {
  platform: 'cjlogistics',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'UNVERIFIED: CJ Logistics API docs are behind a private enterprise portal (api.cjlogistics.com and developer.cjlogistics.com both refuse public connections); no publicly documented carrier-listing endpoint found',
    },
    {
      resource: 'label',
      reason: 'UNVERIFIED: CJ Logistics API docs are behind a private enterprise portal (api.cjlogistics.com and developer.cjlogistics.com both refuse public connections); no publicly documented label endpoint found',
    },
    {
      resource: 'manifest',
      reason: 'UNVERIFIED: CJ Logistics API docs are behind a private enterprise portal (api.cjlogistics.com and developer.cjlogistics.com both refuse public connections); no publicly documented manifest endpoint found',
    },
    {
      resource: 'order',
      reason: 'UNVERIFIED: CJ Logistics API docs are behind a private enterprise portal (api.cjlogistics.com and developer.cjlogistics.com both refuse public connections); no publicly documented order endpoint found',
    },
    {
      resource: 'rate',
      reason: 'UNVERIFIED: CJ Logistics API docs are behind a private enterprise portal (api.cjlogistics.com and developer.cjlogistics.com both refuse public connections); no publicly documented rate-quoting endpoint found',
    },
    {
      resource: 'warehouse',
      reason: 'UNVERIFIED: CJ Logistics API docs are behind a private enterprise portal (api.cjlogistics.com and developer.cjlogistics.com both refuse public connections); no publicly documented warehouse endpoint found',
    },
  ],
} as const
