export const metadata = {
  platform: 'buildertrend',
  totalResources: 6,
  availableResources: ['comment', 'project', 'task', 'user', 'workspace'],
  unavailableResources: [
    {
      resource: 'tag',
      reason:
        'Buildertrend has no tag concept in its partner REST API; the platform UI has simple labels for filtering but no /tags endpoint is exposed via the v1 API.',
    },
  ],
} as const
