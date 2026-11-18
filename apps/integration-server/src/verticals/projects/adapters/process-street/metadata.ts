export const metadata = {
  platform: 'process-street',
  totalResources: 6,
  availableResources: ['comment', 'project', 'task', 'user'],
  unavailableResources: [
    {
      resource: 'tag',
      reason:
        'Process Street v1.1 REST API has no /tags endpoint; tags are a UI-only Library feature with no programmatic read access.',
    },
    {
      resource: 'workspace',
      reason:
        'Process Street v1.1 REST API has no /workspaces or /organizations endpoint; the organisation concept is not exposed via the public API.',
    },
  ],
} as const
