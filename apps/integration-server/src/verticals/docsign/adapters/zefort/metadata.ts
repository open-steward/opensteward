export const metadata = {
  platform: 'zefort',
  totalResources: 5,
  availableResources: ['document', 'envelope', 'signer'],
  unavailableResources: [
    {
      resource: 'audit-trail-entry',
      reason:
        'Zefort has no per-esign audit/event/history API endpoint; the contract audit log is UI-only and is not exposed in the REST API.',
    },
    {
      resource: 'template',
      reason:
        'Zefort exposes no template resource in its REST API; template management is not available programmatically.',
    },
  ],
} as const
