export const metadata = {
  platform: 'unthread',
  totalResources: 7,
  availableResources: ['contact', 'message', 'tag', 'team', 'ticket', 'user'],
  unavailableResources: [
    {
      resource: 'macro',
      reason:
        'Unthread has no canned-response / macro feature; no such endpoint exists in the API (verified against https://docs.unthread.io/docs/api-docs/api-reference).',
    },
  ],
} as const
