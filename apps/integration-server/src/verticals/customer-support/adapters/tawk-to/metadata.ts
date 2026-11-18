export const metadata = {
  platform: 'tawk-to',
  totalResources: 7,
  availableResources: ['message', 'ticket', 'user'],
  unavailableResources: [
    {
      resource: 'contact',
      reason:
        'tawk.to REST API has no contact list or read endpoint; official rep confirmed contacts cannot be read or created via API (community.tawk.to/t/create-and-update-contacts-and-tickets-with-resp-api/1881)',
    },
    {
      resource: 'macro',
      reason:
        'tawk.to REST API exposes no canned-reply or macro endpoint; no such resource appears in any public API documentation or community discussion',
    },
    {
      resource: 'tag',
      reason:
        'tawk.to REST API has no tag list endpoint; tags appear only as chat-statistic filter dimensions, not as listable objects',
    },
    {
      resource: 'team',
      reason:
        'tawk.to REST API has no team or department list endpoint; no such resource appears in any public API documentation or community discussion',
    },
  ],
} as const
