export const metadata = {
  platform: 'birdview',
  totalResources: 6,
  availableResources: ['project', 'task', 'user'],
  unavailableResources: [
    {
      resource: 'tag',
      reason:
        'Birdview PSA has no first-class tag/label resource; the v2 API exposes no /tags endpoint.',
    },
    {
      resource: 'workspace',
      reason:
        'Spaces have no list/get endpoint in v2; SpaceId is a filter-only field on projects and tasks.',
    },
    {
      resource: 'comment',
      reason:
        'Its v2 API declares "/api/v2/tasks/{id}/messages" (and "/api/v2/projects/{id}/messages") with only a "post" operation, and no endpoint reads messages back.',
    },
  ],
} as const
