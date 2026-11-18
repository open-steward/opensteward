export const metadata = {
  platform: 'tilaka',
  totalResources: 5,
  availableResources: ['envelope', 'signer', 'document'],
  unavailableResources: [
    {
      resource: 'audit-trail-entry',
      reason:
        'Tilaka Sign+ has no dedicated audit-trail endpoint; the managed API surface is limited to /plus-upload, /plus-requestsign, /plus-executesign, and /plus-checksignstatus',
    },
    {
      resource: 'template',
      reason: 'Tilaka Sign+ exposes no template resource on its managed signing API',
    },
  ],
} as const
