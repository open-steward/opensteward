export const metadata = {
  platform: 'seatable',
  totalResources: 6,
  availableResources: ['comment', 'project', 'task', 'user', 'workspace'],
  unavailableResources: [
    {
      resource: 'tag',
      reason:
        'SeaTable has no native tag/label object; tags are implemented as select/multi-select column types within rows, not as standalone API resources with dedicated endpoints',
    },
  ],
} as const
