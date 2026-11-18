export const metadata = {
  platform: 'salesnexus',
  totalResources: 6,
  availableResources: ['activity', 'contact', 'deal', 'note'],
  unavailableResources: [
    {
      resource: 'company',
      reason:
        'SalesNexus has no standalone company/organisation resource or API endpoint; company name is stored as a field on the contact record (field 47).',
    },
    {
      resource: 'pipeline',
      reason:
        'SalesNexus has no distinct pipeline or pipeline-stage API; deal stage is a single numeric field on the sales opportunity record (field 234) with no list/get endpoint for stage definitions.',
    },
  ],
} as const
