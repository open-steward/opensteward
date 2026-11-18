export const metadata = {
  platform: 'swisscom-trust-services',
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
        'Swisscom AIS exposes only /sign and /pending endpoints. There is no template management concept — "templating" in AIS refers solely to auto-populating a DN field within a sign request body, not a listable/gettable template resource.',
    },
  ],
} as const
