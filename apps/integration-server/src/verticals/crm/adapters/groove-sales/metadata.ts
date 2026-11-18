export const metadata = {
  platform: 'groove-sales',
  totalResources: 6,
  availableResources: ['contact', 'note'],
  unavailableResources: [
    {
      resource: 'activity',
      reason:
        'UNVERIFIED: developer.groove.co is unreachable, so this could not be confirmed against official docs; the adapter README documents no /v1/activities endpoint in Groove API v1 — logged interactions are only accessible through the internal analytics UI.',
    },
    {
      resource: 'company',
      reason:
        'UNVERIFIED: developer.groove.co is unreachable, so this could not be confirmed against official docs; the adapter README documents no /v1/companies or equivalent account endpoint in Groove API v1 — company name is only a denormalised string field on the person record.',
    },
    {
      resource: 'deal',
      reason:
        'UNVERIFIED: developer.groove.co is unreachable, so this could not be confirmed against official docs; the adapter README documents no /v1/deals, /v1/opportunities, or pipeline-stage endpoints in Groove API v1.',
    },
    {
      resource: 'pipeline',
      reason:
        'UNVERIFIED: developer.groove.co is unreachable, so this could not be confirmed against official docs; the adapter README documents no pipeline or stage management endpoints in Groove API v1.',
    },
  ],
} as const
