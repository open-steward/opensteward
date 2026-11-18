export const metadata = {
  platform: 'plane',
  totalResources: 6,
  availableResources: ['comment', 'project', 'tag', 'task', 'user'],
  unavailableResources: [
    {
      resource: 'workspace',
      reason:
        'The Plane public REST API v1 exposes no dedicated workspace endpoint. Workspaces are routing parameters (slug) only; workspace metadata is not returned as a standalone resource.',
    },
  ],
} as const
