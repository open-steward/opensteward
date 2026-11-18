export const metadata = {
  platform: 'workfront',
  totalResources: 6,
  availableResources: ['comment', 'project', 'task', 'user', 'workspace'],
  unavailableResources: [
    {
      resource: 'tag',
      reason:
        'Workfront has no dedicated tag/label object; the nearest concept is the Category (custom-form) object (objCode ctgy), which is an organizational container for custom forms, not a name/color label for work items.',
    },
  ],
} as const
