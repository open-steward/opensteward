export const metadata = {
  platform: 'jobdiva',
  totalResources: 6,
  availableResources: ['activity', 'company', 'contact', 'deal', 'note'],
  unavailableResources: [
    {
      resource: 'pipeline',
      reason:
        'JobDiva is an ATS/staffing platform; its public REST API (apiv2) exposes no pipeline or stage-configuration resource. Submittal stages exist only as enum values on individual submittal records, not as a queryable pipeline entity.',
    },
  ],
} as const
