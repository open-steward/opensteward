export const metadata = {
  platform: 'aha',
  totalResources: 6,
  availableResources: ['comment', 'project', 'task', 'user', 'workspace'],
  unavailableResources: [
    {
      resource: 'tag',
      reason:
        'Aha! has no stand-alone tag resource or /tags endpoint. Tags are inline arrays of plain strings on features with no id or color fields, so they cannot be mapped to the canonical Tag schema.',
    },
  ],
} as const
