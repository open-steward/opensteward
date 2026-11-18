export const metadata = {
  platform: 'conga-sign',
  totalResources: 5,
  availableResources: [
    'audit-trail-entry',
    'document',
    'envelope',
    'signer',
  ],
  unavailableResources: [
    {
      resource: 'template',
      reason:
        'The Conga Sign public signconnector REST API exposes only transaction (package) endpoints; no templates endpoint exists — templates are only a creation-time parameter, not a queryable resource.',
    },
  ],
} as const
