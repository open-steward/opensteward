export const metadata = {
  platform: 'procore',
  totalResources: 6,
  availableResources: ['comment', 'project', 'task', 'user', 'workspace'],
  unavailableResources: [
    {
      resource: 'tag',
      reason:
        'Procore has no first-class tags/labels concept in its REST API for the projects vertical. ' +
        'Resource Planning tags are a UI-only feature with no documented API endpoint.',
    },
  ],
} as const
