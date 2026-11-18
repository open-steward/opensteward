export const metadata = {
  platform: 'mantisbt',
  totalResources: 6,
  availableResources: ['comment', 'project', 'tag', 'task', 'user'],
  unavailableResources: [
    {
      resource: 'workspace',
      reason:
        'MantisBT has no workspace or organisation concept; the official REST API (swagger.json) exposes no workspace endpoint',
    },
  ],
} as const
