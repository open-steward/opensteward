export const metadata = {
  platform: 'ganttpro',
  totalResources: 6,
  availableResources: ['comment', 'project', 'task', 'user', 'workspace'],
  unavailableResources: [
    {
      resource: 'tag',
      reason:
        'GanttPRO API has no tags or labels concept; task organisation uses status, priority, and colour only (confirmed via developer.ganttpro.com)',
    },
  ],
} as const
