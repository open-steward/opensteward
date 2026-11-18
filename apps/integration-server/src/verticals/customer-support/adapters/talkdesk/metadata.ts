export const metadata = {
  platform: 'talkdesk',
  totalResources: 7,
  availableResources: ['contact', 'message', 'team', 'ticket', 'user'],
  unavailableResources: [
    {
      resource: 'macro',
      reason:
        'Talkdesk has no macros/canned-responses REST API. Templates and quick-replies exist as UI features in Digital Engagement but are not exposed via any public REST endpoint.',
    },
    {
      resource: 'tag',
      reason:
        'Talkdesk tags are a UI-only case property. There is no dedicated /tags REST endpoint in the public API; the full list of 21 public Talkdesk APIs contains no Tags API.',
    },
  ],
} as const
