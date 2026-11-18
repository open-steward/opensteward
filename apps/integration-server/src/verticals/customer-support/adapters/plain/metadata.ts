export const metadata = {
  platform: 'plain',
  totalResources: 7,
  availableResources: ['contact', 'macro', 'message', 'tag', 'ticket', 'user'],
  unavailableResources: [
    {
      resource: 'team',
      reason:
        'Plain has no teams concept; the GraphQL schema exposes teamSettings only as configuration ' +
        'tied to label types, not a listable collection of team entities.',
    },
  ],
} as const
