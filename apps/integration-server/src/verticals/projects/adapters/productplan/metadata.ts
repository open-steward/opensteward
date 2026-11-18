export const metadata = {
  platform: 'productplan',
  totalResources: 6,
  availableResources: ['comment', 'project', 'tag', 'task', 'user'],
  unavailableResources: [
    {
      resource: 'workspace',
      reason:
        'ProductPlan has no workspace or organisation API endpoint. The platform is account-scoped; ' +
        'no tenant hierarchy is exposed via the v2 REST API (endpoint absent from the official ' +
        'endpoint list and returned 404 in automated probes).',
    },
  ],
} as const
