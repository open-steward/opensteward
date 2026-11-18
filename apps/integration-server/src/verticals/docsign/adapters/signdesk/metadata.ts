export const metadata = {
  platform: 'signdesk',
  totalResources: 5,
  availableResources: ['envelope'],
  unavailableResources: [
    {
      resource: 'template',
      reason:
        'UNVERIFIED: SignDesk REST API docs are login-gated (docs.melento.ai requires authentication); no public source confirms a listable template endpoint exists. The existing adapter was authored with the note that SignDesk has no listable template REST resource, but this could not be independently verified against live docs.',
    },
    {
      resource: 'audit-trail-entry',
      reason:
        'No public first-party source documents a read for it (the reference at https://docs.melento.ai/ is login-gated), and the path this adapter used is not routed on api.signdesk.in, which answers "Cannot GET /api/esign/requests/{id}/audit-trail" (HTTP 404) before any authentication',
    },
    {
      resource: 'document',
      reason:
        'No public first-party source documents a read for it (the reference at https://docs.melento.ai/ is login-gated), and the path this adapter used is not routed on api.signdesk.in, which answers "Cannot GET /api/esign/requests/{id}" (HTTP 404) before any authentication',
    },
    {
      resource: 'signer',
      reason:
        'No public first-party source documents a read for it (the reference at https://docs.melento.ai/ is login-gated), and the path this adapter used is not routed on api.signdesk.in, which answers "Cannot GET /api/esign/requests/{id}" (HTTP 404) before any authentication',
    },
  ],
} as const
