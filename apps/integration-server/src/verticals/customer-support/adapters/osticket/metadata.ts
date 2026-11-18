export const metadata = {
  platform: 'osticket',
  totalResources: 7,
  availableResources: ['ticket', 'message'],
  unavailableResources: [
    {
      resource: 'contact',
      reason:
        'osTicket REST API has no endpoint for listing or fetching contacts/end-users; only ticket creation is in the official API and the community API Endpoints Plugin.',
    },
    {
      resource: 'macro',
      reason:
        'osTicket has no REST API endpoint for canned responses (macros); they are admin-only UI-managed and not exposed via any known REST endpoint.',
    },
    {
      resource: 'tag',
      reason:
        'osTicket REST API has no endpoint for listing or fetching tags; tags exist in the data model but are not exposed via any known REST endpoint.',
    },
    {
      resource: 'team',
      reason:
        'osTicket REST API has no endpoint for listing or fetching teams; teams are referenced on ticket objects but no dedicated REST endpoint exists.',
    },
    {
      resource: 'user',
      reason:
        'osTicket REST API has no endpoint for listing or fetching staff/agents; the official API and community plugin expose only ticket-scoped operations.',
    },
  ],
} as const
