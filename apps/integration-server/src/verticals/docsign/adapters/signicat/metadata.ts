/**
 * Signicat adapter resource coverage metadata.
 *
 * Sign API v2 reference: https://developer.signicat.com/apis/electronic-signing/sign-api-v2/
 *
 * audit-trail-entry: The Sign API v2 exposes no per-session event / audit-trail
 *   endpoint. The separate Signicat Audit Logs API (https://api.signicat.com/audit/)
 *   is a general platform-level log for authentication events, not for
 *   document-signing session history, and its schema does not map to the
 *   canonical AuditTrailEntry type.
 *
 * template: The Sign API v2 has no template concept. Signing sessions are
 *   created dynamically; no template storage or retrieval endpoints exist.
 */

export const metadata = {
  platform: 'signicat',
  totalResources: 5,
  availableResources: ['envelope', 'signer', 'document'],
  unavailableResources: [
    {
      resource: 'audit-trail-entry',
      reason:
        'Sign API v2 has no per-session audit-trail endpoint. The separate Signicat Audit Logs API is a general platform log for authentication events and does not expose signing-session event history.',
    },
    {
      resource: 'template',
      reason:
        'Sign API v2 has no template concept. Signing sessions are created dynamically; no template storage or retrieval endpoints exist.',
    },
  ],
} as const
