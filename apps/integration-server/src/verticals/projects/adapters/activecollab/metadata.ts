export const metadata = {
  platform: 'activecollab',
  totalResources: 6,
  availableResources: ['comment', 'project', 'tag', 'task', 'user'],
  unavailableResources: [
    {
      resource: 'workspace',
      reason:
        'ActiveCollab has no workspace concept; an account is a single workspace with no listable workspace objects',
    },
  ],
} as const
