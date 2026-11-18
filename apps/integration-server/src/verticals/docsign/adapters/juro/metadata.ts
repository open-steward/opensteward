export const metadata = {
  platform: 'juro',
  totalResources: 5,
  availableResources: ['document', 'envelope', 'signer', 'template'],
  unavailableResources: [
    {
      resource: 'audit-trail-entry',
      reason:
        'Juro v3 REST API exposes no audit/timeline/history endpoint; contract lifecycle events are delivered exclusively via webhooks.',
    },
  ],
} as const
