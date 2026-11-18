export const metadata = {
  platform: 'gmo-sign',
  totalResources: 5,
  availableResources: ['document', 'envelope', 'signer'],
  unavailableResources: [
    {
      resource: 'audit-trail-entry',
      reason:
        'GMO Sign exposes no read endpoint for audit-trail / event-history. The only read endpoint is /envelope/status, which returns envelope + signer + document data but no event log.',
    },
    {
      resource: 'template',
      reason:
        'GMO Sign exposes no endpoint to list or fetch templates as objects. Templates are referenced by ID only when sending a new envelope; there is no GET/list endpoint for the template resource.',
    },
  ],
} as const
