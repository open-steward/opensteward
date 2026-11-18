export const metadata = {
  platform: 'validated-id',
  totalResources: 5,
  availableResources: ['envelope', 'signer', 'document'],
  unavailableResources: [
    {
      resource: 'audit-trail-entry',
      reason:
        'VIDsigner delivers audit evidence as a signed PDF report (not a queryable event stream); the REST API v2.2 has no structured audit-trail endpoint.',
    },
    {
      resource: 'template',
      reason:
        'VIDsigner REST API v2.2 exposes no template catalogue; the template management UI is not surfaced via the documentlist/documentinfo API surface.',
    },
  ],
} as const
