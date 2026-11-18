export const metadata = {
  platform: 'zenvia',
  totalResources: 7,
  availableResources: ['contact', 'message', 'team', 'ticket', 'user'],
  unavailableResources: [
    {
      resource: 'macro',
      reason:
        'Zenvia Customer Cloud has no canned-response/macro concept exposed via its REST API (confirmed: sales.zenvia.com/api/v1 spec lists no /macros endpoint)',
    },
    {
      resource: 'tag',
      reason:
        'Tags are a UI-only feature in Zenvia Customer Cloud; the REST API (sales.zenvia.com/api/v1) exposes no /tags endpoint for listing or retrieving tag definitions',
    },
  ],
} as const
