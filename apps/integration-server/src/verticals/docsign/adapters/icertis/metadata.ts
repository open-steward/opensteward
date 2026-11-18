export const metadata = {
  platform: 'icertis',
  totalResources: 5,
  availableResources: ['document', 'envelope', 'signer', 'template'],
  unavailableResources: [
    {
      resource: 'audit-trail-entry',
      reason:
        'ICI has no public REST endpoint for signing-audit events; the platform exposes no audit-trail or event-history API surface in its documented API catalog.',
    },
  ],
} as const
