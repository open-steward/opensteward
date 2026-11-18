export const metadata = {
  platform: 'pdffiller',
  totalResources: 5,
  availableResources: ['envelope', 'signer', 'template'],
  unavailableResources: [
    {
      resource: 'document',
      reason:
        'pdfFiller v2 API exposes no per-envelope document-metadata endpoint; the signature_request carries only a document_id foreign key with no name/size/pages fields reachable via a public REST call.',
    },
    {
      resource: 'audit-trail-entry',
      reason:
        'pdfFiller v2 API has no audit-trail or activity-log endpoint; no such resource is documented in the official SDK clients or API reference.',
    },
  ],
} as const
