/**
 * SignatureAPI adapter resource-coverage metadata.
 *
 * Templates are a DOCX document-generation feature (external files referenced
 * by URL at envelope-creation time). There is no /templates REST endpoint and
 * no listable/gettable template object in the SignatureAPI.
 *
 * Docs: https://signatureapi.com/docs/api/resources/documents/templates
 */
export const metadata = {
  platform: 'signatureapi',
  totalResources: 5,
  availableResources: [
    'audit-trail-entry',
    'document',
    'envelope',
    'signer',
  ],
  unavailableResources: [
    {
      resource: 'template',
      reason:
        'SignatureAPI templates are DOCX files referenced by URL at envelope-creation time; there is no /templates REST endpoint and no listable/gettable template object in the API.',
    },
  ],
} as const
