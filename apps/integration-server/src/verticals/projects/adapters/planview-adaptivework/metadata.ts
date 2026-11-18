export const metadata = {
  platform: 'planview-adaptivework',
  totalResources: 6,
  availableResources: ['comment', 'project', 'task', 'user', 'workspace'],
  unavailableResources: [
    {
      resource: 'tag',
      reason:
        'AdaptiveWork has no first-class tag/label entity on work items; the REST API exposes no Tag typeName or equivalent endpoint.',
    },
  ],
} as const
