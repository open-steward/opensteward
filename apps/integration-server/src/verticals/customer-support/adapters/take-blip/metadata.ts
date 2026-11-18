export const metadata = {
  platform: 'take-blip',
  totalResources: 7,
  availableResources: ['contact', 'message', 'tag', 'team', 'ticket', 'user'],
  unavailableResources: [
    {
      resource: 'macro',
      reason:
        'UNVERIFIED: GET /custom-replies endpoint confirmed in Blip Desk docs but response object field names for individual canned replies are not accessible in public documentation (help.blip.ai returns 403; docs are JS-rendered).',
    },
  ],
} as const
