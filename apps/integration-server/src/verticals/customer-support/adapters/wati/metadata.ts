export const metadata = {
  platform: 'wati',
  totalResources: 7,
  availableResources: ['contact', 'message', 'ticket'],
  unavailableResources: [
    {
      resource: 'macro',
      reason:
        'WATI quick replies / canned responses are a UI-only feature; no REST API endpoint exists to list or retrieve them (confirmed via docs.wati.io/llms.txt full endpoint index).',
    },
    {
      resource: 'tag',
      reason:
        'WATI contact tags/labels are managed only through the UI; no REST API endpoint exists to list or retrieve tags (confirmed via docs.wati.io/llms.txt full endpoint index).',
    },
    {
      resource: 'team',
      reason:
        'WATI exposes no REST endpoint to list operator teams/groups; only PUT /api/ext/v3/contacts/teams (assign-contact) exists, which is not a teams list endpoint (confirmed via docs.wati.io/llms.txt full endpoint index).',
    },
    {
      resource: 'user',
      reason:
        'Its API reference (https://docs.wati.io/llms.txt) documents no operator list or lookup endpoint, only "Assign an operator to a conversation" and "Assign User"',
    },
  ],
} as const
