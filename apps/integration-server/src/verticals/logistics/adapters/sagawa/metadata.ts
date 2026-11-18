export const metadata = {
  platform: 'sagawa',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'UNVERIFIED: Sagawa developer portal (developer.sagawa-exp.co.jp) is unreachable and Sagawa API docs require a signed contract; no publicly documented carrier-listing endpoint found',
    },
    {
      resource: 'label',
      reason:
        'UNVERIFIED: Sagawa\'s label issuance API (SG Systems Biz-Logi API) is only accessible after signing a service agreement; API specification is not publicly available',
    },
    {
      resource: 'manifest',
      reason:
        'UNVERIFIED: Sagawa developer portal (developer.sagawa-exp.co.jp) is unreachable and Sagawa API docs require a signed contract; no publicly documented manifest endpoint found',
    },
    {
      resource: 'order',
      reason:
        'UNVERIFIED: Sagawa developer portal (developer.sagawa-exp.co.jp) is unreachable and Sagawa API docs require a signed contract; no publicly documented order endpoint found',
    },
    {
      resource: 'rate',
      reason:
        'UNVERIFIED: Sagawa developer portal (developer.sagawa-exp.co.jp) is unreachable and Sagawa API docs require a signed contract; no publicly documented rate-quoting endpoint found',
    },
    {
      resource: 'warehouse',
      reason:
        'UNVERIFIED: Sagawa developer portal (developer.sagawa-exp.co.jp) is unreachable and Sagawa API docs require a signed contract; no publicly documented warehouse endpoint found',
    },
  ],
} as const
