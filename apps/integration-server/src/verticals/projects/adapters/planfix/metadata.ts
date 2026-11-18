export const metadata = {
  platform: 'planfix',
  totalResources: 6,
  availableResources: ['comment', 'project', 'task', 'user'],
  unavailableResources: [
    {
      resource: 'tag',
      reason:
        "Planfix has no freeform task-tag resource. Its 'data tags' are structured data-entry forms attached to comments, not the label taxonomy the canonical Tag models; there is no /tag/list endpoint.",
    },
    {
      resource: 'workspace',
      reason:
        'Planfix is single-account: the account host is the workspace, so there is no enumerable workspace resource.',
    },
  ],
} as const
