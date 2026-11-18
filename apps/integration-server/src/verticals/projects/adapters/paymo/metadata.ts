export const metadata = {
  platform: 'paymo',
  totalResources: 6,
  availableResources: ['comment', 'project', 'task', 'user', 'workspace'],
  unavailableResources: [
    {
      resource: 'tag',
      reason:
        'Paymo has no tag or label concept; no /tags endpoint exists and no tag fields appear on projects or tasks in the official API documentation.',
    },
  ],
} as const
