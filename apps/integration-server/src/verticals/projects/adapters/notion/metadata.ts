export const metadata = {
  platform: 'notion',
  totalResources: 6,
  availableResources: ['comment', 'project', 'task', 'user', 'workspace'],
  unavailableResources: [
    {
      resource: 'tag',
      reason: 'Notion has no tag or label concept exposed via the REST API',
    },
  ],
} as const
