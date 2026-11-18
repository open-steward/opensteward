/**
 * Lumin Sign adapter — resource coverage metadata.
 *
 * Verified against the official Lumin Developer Docs index
 * (https://developers.luminpdf.com/llms.txt) and the OpenAPI specification
 * (https://developers.luminpdf.com/tabs/api-reference/openapi.json).
 */
export const metadata = {
  platform: 'lumin-sign',
  totalResources: 5,
  availableResources: ['envelope', 'signer', 'template'],
  unavailableResources: [
    {
      resource: 'document',
      reason:
        'No GET document-metadata endpoint exists. Document endpoints are write-only (POST /documents, POST /documents/from-template). GET /signature_request/{id}/file returns a signed download URL for binary PDF content, not a metadata record. The signature_request response itself carries no per-document fields.',
    },
    {
      resource: 'audit-trail-entry',
      reason:
        'No audit trail or event-history endpoint exists in the Lumin Sign API. Confirmed absent from the complete official documentation index (llms.txt) and OpenAPI specification.',
    },
  ],
} as const
