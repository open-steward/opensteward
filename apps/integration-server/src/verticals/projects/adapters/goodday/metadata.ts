export const metadata = {
  platform: 'goodday',
  totalResources: 6,
  availableResources: ['comment', 'project', 'task', 'user'],
  unavailableResources: [
    {
      resource: 'tag',
      reason:
        'GoodDay API v2 has no endpoint to enumerate tags. The only tag endpoint is GET /tag/{TAG-ID}/tasks (retrieves tasks by a known tag ID); there is no /tags list endpoint.',
    },
    {
      resource: 'workspace',
      reason:
        'GoodDay has a single implicit organisation-level workspace with no dedicated workspace list or get endpoint in API v2.',
    },
  ],
} as const
