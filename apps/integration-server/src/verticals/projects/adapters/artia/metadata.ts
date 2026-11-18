export const metadata = {
  platform: 'artia',
  totalResources: 6,
  availableResources: ['project', 'task', 'user'],
  unavailableResources: [
    {
      resource: 'comment',
      reason:
        'Artia has no publicly documented comment or note GraphQL query in its public API; neither the official docs nor the api-examples repository expose a comments operation.',
    },
    {
      resource: 'tag',
      reason:
        'Artia has no freeform tag or label taxonomy in its public GraphQL API; no tag-related query or mutation exists in the documented schema.',
    },
    {
      resource: 'workspace',
      reason:
        'The Artia Organisation is the single implicit workspace; there is no enumerable multi-workspace query in the public API — only a single Organisation scope per credential set.',
    },
  ],
} as const
