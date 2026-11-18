export const metadata = {
  platform: 'toggl-plan',
  totalResources: 6,
  availableResources: ['project', 'task', 'user', 'workspace'],
  unavailableResources: [
    {
      resource: 'comment',
      reason: 'Toggl Plan API v5 has no comments endpoint; the platform does not expose task or project comments via its REST API.',
    },
    {
      resource: 'tag',
      reason: 'Toggl Plan API v5 has no standalone tags endpoint; tag IDs are embedded as arrays on tasks and projects but cannot be listed or fetched independently.',
    },
  ],
} as const
