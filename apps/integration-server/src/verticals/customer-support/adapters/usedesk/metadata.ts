export const metadata = {
  platform: 'usedesk',
  totalResources: 7,
  availableResources: ['contact', 'message', 'tag', 'team', 'ticket', 'user'],
  unavailableResources: [
    {
      resource: 'macro',
      reason:
        'UseDesk exposes macros only as a UI feature; the REST API (api.usedocs.com) has no macros/canned-responses endpoint category.',
    },
  ],
} as const
