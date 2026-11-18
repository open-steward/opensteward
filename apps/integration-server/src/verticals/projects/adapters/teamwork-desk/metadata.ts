export const metadata = {
  platform: 'teamwork-desk',
  totalResources: 6,
  availableResources: ['comment', 'project', 'tag', 'task', 'user'],
  unavailableResources: [
    {
      resource: 'workspace',
      reason:
        'The Teamwork Spaces installation is the workspace; there is no list-workspaces endpoint in the Spaces API.',
    },
  ],
} as const
