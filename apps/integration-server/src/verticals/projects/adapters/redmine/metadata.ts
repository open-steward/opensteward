export const metadata = {
  platform: 'redmine',
  totalResources: 6,
  availableResources: ['comment', 'project', 'task', 'user'],
  unavailableResources: [
    {
      resource: 'tag',
      reason:
        'Redmine core has no tag concept. Tags are provided only by third-party plugins; the maintainers closed the REST API request as invalid (issue #36292).',
    },
    {
      resource: 'workspace',
      reason:
        'Redmine has no workspace concept. Projects are the top-level grouping unit and there is no higher-level workspace or organisation resource in the REST API.',
    },
  ],
} as const
