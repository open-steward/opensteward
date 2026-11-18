export const metadata = {
  platform: 'microsoft-todo',
  totalResources: 6,
  availableResources: ['project', 'tag', 'task', 'user', 'workspace'],
  unavailableResources: [
    {
      resource: 'comment',
      reason:
        'Microsoft To Do has no comment entity. The task body field is a single description (not threaded), and checklistItems are subtasks, not comments.',
    },
  ],
} as const
