export const metadata = {
  platform: 'coda',
  totalResources: 6,
  availableResources: ['project', 'task', 'user', 'workspace'],
  unavailableResources: [
    {
      resource: 'comment',
      reason:
        'Coda API v1 has no comment or discussion endpoint; comments are not exposed via the REST API.',
    },
    {
      resource: 'tag',
      reason:
        'Coda API v1 has no tag or label endpoint; Coda docs/tables have no tag/label concept in the API.',
    },
  ],
} as const
