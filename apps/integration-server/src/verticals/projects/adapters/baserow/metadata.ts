export const metadata = {
  platform: 'baserow',
  totalResources: 6,
  availableResources: ['project', 'task', 'user', 'workspace'],
  unavailableResources: [
    {
      resource: 'comment',
      reason:
        'Row comments exist only in the Baserow Premium plugin (mounted at /api/row_comments/); they are not accessible via a free-tier database token.',
    },
    {
      resource: 'tag',
      reason: 'Baserow has no tag or label concept in its REST API.',
    },
  ],
} as const
