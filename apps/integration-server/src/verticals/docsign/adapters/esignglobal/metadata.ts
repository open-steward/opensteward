export const metadata = {
  platform: 'esignglobal',
  totalResources: 5,
  availableResources: ['envelope', 'signer', 'document', 'template'],
  unavailableResources: [
    {
      resource: 'audit-trail-entry',
      reason:
        'eSignGlobal exposes no queryable audit-events endpoint; Callback Events are push-only webhooks with no history read surface.',
    },
  ],
} as const
