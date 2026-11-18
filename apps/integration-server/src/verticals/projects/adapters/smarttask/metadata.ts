export const metadata = {
  platform: 'smarttask',
  totalResources: 6,
  availableResources: ['comment', 'project', 'task', 'user', 'workspace'],
  unavailableResources: [
    {
      resource: 'tag',
      reason:
        'SmartTask REST API exposes no tag or label endpoints; the official developer docs (dev.smarttask.io) list all endpoint categories and none cover tags, and task/project responses contain no tag fields.',
    },
  ],
} as const
