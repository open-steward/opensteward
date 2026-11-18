export const metadata = {
  platform: 'gainsight',
  totalResources: 6,
  availableResources: ['activity', 'company', 'contact', 'note'],
  unavailableResources: [
    {
      resource: 'deal',
      reason:
        'Renewal Center API is write-only (POST create + PATCH update only); no GET/list endpoint exists to read opportunities back via the documented REST API.',
    },
    {
      resource: 'pipeline',
      reason:
        'Gainsight NXT has no sales pipeline concept or pipeline listing endpoint in its REST API; Renewal Center stages are admin-configured and not exposed as a queryable resource.',
    },
  ],
} as const
