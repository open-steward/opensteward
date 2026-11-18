export const metadata = {
  platform: 'tuleap',
  totalResources: 6,
  availableResources: ['comment', 'project', 'task', 'user'],
  unavailableResources: [
    {
      resource: 'tag',
      reason:
        'Tuleap has no platform-level tag or label resource in its REST API; labels are not a first-class concept.',
    },
    {
      resource: 'workspace',
      reason:
        'Tuleap has no workspace abstraction; projects are the top-level organizational unit in the REST API.',
    },
  ],
} as const
