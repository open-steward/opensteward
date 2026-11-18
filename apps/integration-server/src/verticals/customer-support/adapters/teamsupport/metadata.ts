export const metadata = {
  platform: 'teamsupport',
  totalResources: 7,
  availableResources: ['contact', 'message', 'team', 'ticket', 'user'],
  unavailableResources: [
    {
      resource: 'tag',
      reason:
        'UNVERIFIED: TeamSupport has a Ticket Tags UI feature but all REST API documentation requires authentication; no public source confirms a /api/json/tags endpoint exists.',
    },
    {
      resource: 'macro',
      reason:
        'UNVERIFIED: TeamSupport has a Suggested Solutions (canned responses) UI feature but all REST API documentation requires authentication; no public source confirms a macros/canned-responses endpoint exists.',
    },
  ],
} as const
