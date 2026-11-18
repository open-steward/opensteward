export const metadata = {
  platform: 'rocketlane',
  totalResources: 6,
  availableResources: ['comment', 'project', 'task', 'user'],
  unavailableResources: [
    {
      resource: 'tag',
      reason:
        'Rocketlane has no standalone tag/label resource in its public REST API (confirmed via llms.txt endpoint index at developer.rocketlane.com).',
    },
    {
      resource: 'workspace',
      reason:
        'Rocketlane has no workspace concept; the account is a single tenant and customers (companies) are represented as a field on projects, not a dedicated endpoint.',
    },
  ],
} as const
