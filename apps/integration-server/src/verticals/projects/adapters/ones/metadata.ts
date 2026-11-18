export const metadata = {
  platform: 'ones',
  totalResources: 6,
  availableResources: ['comment', 'project', 'task', 'user'],
  unavailableResources: [
    {
      resource: 'tag',
      reason:
        'ONES OpenAPI v2 has no tags or labels resource. No tag/label endpoint exists in the project or account API surface.',
    },
    {
      resource: 'workspace',
      reason:
        'ONES uses "team" as its organizational unit but the project OpenAPI v2 surface exposes no /team or workspace endpoint. The Wiki-product Space API is unrelated to the project management vertical.',
    },
  ],
} as const
