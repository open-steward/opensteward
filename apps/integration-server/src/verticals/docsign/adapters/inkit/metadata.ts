/**
 * Inkit adapter — resource coverage metadata.
 *
 * Inkit is a document-GENERATION platform (rendered output from templates +
 * merge parameters). It has no e-signature workflow: no envelopes, signing
 * order, signer management, or audit trail. The public REST API exposes only
 * document and template resources.
 *
 * Verified against https://docs.inkit.com/docs/api-endpoints (June 2026).
 */
export const metadata = {
  platform: 'inkit',
  totalResources: 5,
  availableResources: ['document', 'template'],
  unavailableResources: [
    {
      resource: 'envelope',
      reason:
        'Inkit is a document-generation platform with no envelope/signing-workflow concept; no envelope endpoint exists in the public REST API.',
    },
    {
      resource: 'signer',
      reason:
        'Inkit has no signer-management endpoints; signers are specified inline on generation requests only and cannot be listed or retrieved independently.',
    },
    {
      resource: 'audit-trail-entry',
      reason:
        'Inkit has no audit-trail or activity-log endpoint; there is no API surface for retrieving per-document or per-signing-event audit entries.',
    },
  ],
} as const
