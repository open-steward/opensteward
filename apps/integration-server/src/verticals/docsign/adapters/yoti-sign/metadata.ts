export const metadata = {
  platform: 'yoti-sign',
  totalResources: 5,
  availableResources: ['envelope', 'signer'],
  unavailableResources: [
    {
      resource: 'document',
      reason:
        'The only document endpoint (GET /v2/envelopes/<id>/completed-documents) returns a ZIP binary of signed content; there is no JSON metadata endpoint for document name/size/page-count.',
    },
    {
      resource: 'audit-trail-entry',
      reason:
        'Yoti Sign exposes no documented REST endpoint for audit trail events; the audit trail is available only via the portal UI.',
    },
    {
      resource: 'template',
      reason:
        'Yoti Sign templates are portal-only (create/export/import via UI); no documented REST API exists to list or retrieve templates programmatically.',
    },
  ],
} as const
