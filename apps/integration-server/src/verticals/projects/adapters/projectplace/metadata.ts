export const metadata = {
  platform: 'projectplace',
  totalResources: 6,
  availableResources: ['comment', 'project', 'tag', 'task', 'user'],
  unavailableResources: [
    {
      resource: 'workspace',
      reason:
        'Projectplace has no separate workspace layer; the project IS the workspace. ' +
        'The /accounts endpoint covers only custom fields and intake requests, not ' +
        'organization-level workspace objects.',
    },
  ],
} as const
