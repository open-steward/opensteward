export const metadata = {
  platform: 'fibery',
  totalResources: 6,
  availableResources: ['workspace', 'project', 'task', 'user', 'comment'],
  unavailableResources: [
    {
      resource: 'tag',
      reason:
        'Fibery has no first-class tag or label entity; single-select fields are private enum databases, not a taggable concept surfaced via the HTTP API.',
    },
  ],
} as const
