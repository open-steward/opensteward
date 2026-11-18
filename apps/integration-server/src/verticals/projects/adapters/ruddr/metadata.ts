export const metadata = {
  platform: 'ruddr',
  totalResources: 6,
  availableResources: ['project', 'tag', 'user', 'task'],
  unavailableResources: [
    {
      resource: 'comment',
      reason:
        'Ruddr has no comment or note model in its REST API (confirmed absent across all 68 resource categories at docs.ruddr.io)',
    },
    {
      resource: 'workspace',
      reason:
        'Its API documents no workspace resource (the only workspace paths are /workspace-roles)',
    },
  ],
} as const
