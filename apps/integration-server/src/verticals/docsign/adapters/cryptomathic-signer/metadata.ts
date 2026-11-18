/**
 * Cryptomathic Signer adapter — resource coverage metadata.
 *
 * Cryptomathic Signer exposes the Cloud Signature Consortium (CSC) API v2
 * exclusively. The CSC specification defines only credential management and
 * hash/document signing methods; it contains no audit-log query, no document
 * repository, and no template concept. Resource coverage therefore reflects
 * the protocol's inherent scope, not a gap in the adapter implementation.
 *
 * CSC API v2 endpoints (complete list):
 *   /info, /auth/login, /auth/revoke,
 *   /credentials/list, /credentials/info, /credentials/authorize,
 *   /credentials/authorizecheck, /credentials/getchallenge,
 *   /credentials/extendtransaction,
 *   /signatures/signhash, /signatures/signdoc,
 *   /signatures/signpolling, /signatures/timestamp
 */
export const metadata = {
  platform: 'cryptomathic-signer',
  totalResources: 5,
  availableResources: ['envelope', 'signer'],
  unavailableResources: [
    {
      resource: 'audit-trail-entry',
      reason:
        'The CSC API v2 specification defines no audit-log query method; signing operations are synchronous request/response with no server-side event log exposed to clients.',
    },
    {
      resource: 'document',
      reason:
        'Cryptomathic Signer is hash-based (CSC /signatures/signhash) and optionally accepts raw bytes via /signatures/signdoc, but it provides no document repository or enumeration endpoint — documents never persist server-side.',
    },
    {
      resource: 'template',
      reason:
        'The CSC API v2 specification has no template concept; signing workflows are driven entirely by the calling application, not by server-side templates.',
    },
  ],
} as const
