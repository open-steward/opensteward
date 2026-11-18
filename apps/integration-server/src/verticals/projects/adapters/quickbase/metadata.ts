export const metadata = {
  platform: 'quickbase',
  totalResources: 6,
  availableResources: ['workspace', 'project', 'task', 'tag', 'user'],
  unavailableResources: [
    {
      resource: 'comment',
      reason:
        'Quickbase REST API has no comments or notes endpoint for records; comments are not a first-class REST resource.',
    },
  ],
} as const
