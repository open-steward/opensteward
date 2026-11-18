export const metadata = {
  platform: 'float',
  totalResources: 6,
  availableResources: ['project', 'task', 'user', 'workspace'],
  unavailableResources: [
    {
      resource: 'comment',
      reason: 'Float has no comment or discussion concept in its REST API (v3 reference confirms no comments/notes/annotations endpoints).',
    },
    {
      resource: 'tag',
      reason: 'Float tags are inline string arrays on project and people objects (e.g. "tags": ["iphone app"]), not standalone listable resources; there is no /tags endpoint.',
    },
  ],
} as const
