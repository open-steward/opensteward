export const metadata = {
  platform: 'perdoo',
  totalResources: 6,
  availableResources: ['project', 'task', 'workspace', 'user'],
  unavailableResources: [
    {
      resource: 'comment',
      reason: 'Perdoo has no comment or discussion concept in its GraphQL API.',
    },
    {
      resource: 'tag',
      reason:
        'Tags are embedded fields on objectives/key-results but are not a standalone listable resource via the GraphQL API.',
    },
  ],
} as const
