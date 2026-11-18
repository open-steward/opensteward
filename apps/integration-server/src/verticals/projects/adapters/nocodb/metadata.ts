export const metadata = {
  platform: 'nocodb',
  totalResources: 6,
  availableResources: [
    'comment',
    'project',
    'task',
    'user',
    'workspace',
  ],
  unavailableResources: [
    {
      resource: 'tag',
      reason:
        'NocoDB has no label/tag system exposed via the REST API; the feature has an open request (github.com/nocodb/nocodb/issues/3661) but is not implemented.',
    },
  ],
} as const
