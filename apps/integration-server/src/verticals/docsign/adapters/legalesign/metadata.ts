export const metadata = {
  platform: 'legalesign',
  totalResources: 5,
  availableResources: ['document', 'envelope', 'signer', 'template'],
  unavailableResources: [
    {
      resource: 'audit-trail-entry',
      reason:
        'Legalesign exposes only a binary PDF audit log (/document/{id}/auditlog/) — there is no JSON endpoint that returns structured per-event audit trail data.',
    },
  ],
} as const
