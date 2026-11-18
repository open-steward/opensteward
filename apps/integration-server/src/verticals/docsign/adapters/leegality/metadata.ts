export const metadata = {
  platform: 'leegality',
  totalResources: 5,
  availableResources: ['envelope', 'signer', 'document'],
  unavailableResources: [
    {
      resource: 'audit-trail-entry',
      reason:
        'Leegality exposes the audit trail only as a downloadable PDF blob via GET /v3.3/document/fetchDocument?documentDownloadType=AUDIT_TRAIL — no structured JSON event endpoint exists.',
    },
    {
      resource: 'template',
      reason:
        'Leegality has no documented REST endpoint for listing or fetching templates; template management is UI-only.',
    },
  ],
} as const
