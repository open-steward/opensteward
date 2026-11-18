export const metadata = {
  platform: 'eudonet',
  totalResources: 6,
  availableResources: ['contact', 'company', 'deal', 'note'],
  unavailableResources: [
    {
      resource: 'activity',
      reason:
        'Eudonet has no standard activity/task table in EudoAPI; activity-like data lives in custom tables configured per installation and cannot be addressed via a generic adapter.',
    },
    {
      resource: 'pipeline',
      reason:
        'Eudonet does not expose a standard pipeline or deal-stage resource in EudoAPI; stage values are stored as plain text fields on the Deals table rather than as a queryable pipeline entity.',
    },
  ],
} as const
