export const metadata = {
  platform: 'respond-io',
  totalResources: 7,
  availableResources: ['contact', 'message', 'user'],
  unavailableResources: [
    {
      resource: 'macro',
      reason:
        'Respond.io Snippets (canned responses) are a UI-only feature; no REST API endpoint exists in v2 to list or retrieve them.',
    },
    {
      resource: 'team',
      reason:
        'Respond.io v2 REST API does not expose a teams/agent-group management endpoint; teams are an internal routing concept with no public API surface.',
    },
    {
      resource: 'tag',
      reason:
        'Its Space API documents "Create Space Tag", "Update Space Tag" and "Delete Space Tag", with no endpoint that lists tags',
    },
    {
      resource: 'ticket',
      reason:
        'Its Conversation API documents only "Assign/unassign conversation" and "Open/close conversation" (POST), with no endpoint that lists conversations',
    },
  ],
} as const
