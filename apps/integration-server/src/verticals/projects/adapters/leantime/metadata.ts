export const metadata = {
  platform: 'leantime',
  totalResources: 6,
  availableResources: ['comment', 'project', 'task', 'user'],
  unavailableResources: [
    {
      resource: 'tag',
      reason:
        'The Tags service only exposes getTags(projectId, term) for autocomplete suggestions (returns plain strings, no IDs). There is no listTags/getTag method and tags are a backend-only domain with no UI per Leantime docs.',
    },
    {
      resource: 'workspace',
      reason:
        'Leantime is a single-tenant self-hosted application with no workspace or organisation concept in its API.',
    },
  ],
} as const
