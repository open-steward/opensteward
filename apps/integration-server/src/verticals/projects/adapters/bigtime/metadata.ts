export const metadata = {
  platform: 'bigtime',
  totalResources: 6,
  availableResources: ['project', 'task', 'user', 'workspace'],
  unavailableResources: [
    {
      resource: 'comment',
      reason:
        'BigTime has no task-comment resource; notes are an inline string on the task itself (no dedicated comment endpoint exists in the v2 API).',
    },
    {
      resource: 'tag',
      reason:
        'BigTime exposes no project/task tag (label) resource via the v2 REST API.',
    },
  ],
} as const
