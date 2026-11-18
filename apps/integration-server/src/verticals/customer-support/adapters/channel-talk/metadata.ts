export const metadata = {
  platform: 'channel-talk',
  totalResources: 7,
  availableResources: ['contact', 'message', 'tag', 'ticket', 'user'],
  unavailableResources: [
    {
      resource: 'macro',
      reason:
        'Channel Talk Open API has no canned-response/snippet endpoint under /open/*; ALF-suggested replies are not a listable resource.',
    },
    {
      resource: 'team',
      reason:
        'No /open/teams route exists in any API version. Live (2026-09-13, unauthenticated): /open/v5/teams, /open/v5/teams/{id} and /open/v4/teams all 404 at routing — the same as any other nonexistent path on that stack, not the 401 its authenticated routes return. The current OpenAPI spec (2026-06-01, unversioned /open/*) has no teams path either. UserChat.teamId is a routing field on the ticket, not a listable Team entity, and is deliberately not synthesised into one (see index.ts).',
    },
  ],
} as const
