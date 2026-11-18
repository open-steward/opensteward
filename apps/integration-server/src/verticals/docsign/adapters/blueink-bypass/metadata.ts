/**
 * Resource coverage metadata for the blueink-bypass (Sphereon eIDAS Signature) adapter.
 *
 * Sphereon's eIDAS Advanced Electronic Signature service is a cryptographic
 * signing-primitive API. Its REST surface consists of:
 *   - GET /configs, GET /configs/{id}  — signature configurations (→ Template)
 *   - POST /signatures/*               — digest / signing operations (write-only)
 *   - POST|GET|PUT|DELETE /providers/* — key provider + certificate management
 *
 * There are no envelope, signer, document, or audit-trail endpoints.
 * Verified via https://docs.vdx.sphereon.com/api/eidas/signatures (June 2026).
 */
export const metadata = {
  platform: 'blueink-bypass',
  totalResources: 5,
  availableResources: ['template'],
  unavailableResources: [
    {
      resource: 'envelope',
      reason:
        'Sphereon eIDAS Signature is a cryptographic primitive API with no envelope or signing-workflow surface; confirmed via official API docs at docs.vdx.sphereon.com/api/eidas/signatures.',
    },
    {
      resource: 'signer',
      reason:
        'Sphereon eIDAS Signature has no signer/recipient management endpoints; the API operates on key providers and signature configurations only.',
    },
    {
      resource: 'document',
      reason:
        'Sphereon eIDAS Signature has no document-metadata endpoints; documents are passed inline to signing operations and are not stored or listed.',
    },
    {
      resource: 'audit-trail-entry',
      reason:
        'Sphereon eIDAS Signature has no audit-trail endpoint; the API exposes no event or activity log surface.',
    },
  ],
} as const
