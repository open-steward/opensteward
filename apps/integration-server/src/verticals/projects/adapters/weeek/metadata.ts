export const metadata = {
  platform: 'weeek',
  totalResources: 6,
  availableResources: ['project', 'tag', 'task', 'user', 'workspace'],
  unavailableResources: [
    {
      resource: 'comment',
      reason:
        'Weeek v1 public API has no task-comment endpoint (GET /tm/tasks/{id}/comments returns HTTP 404).',
    },
  ],
} as const
