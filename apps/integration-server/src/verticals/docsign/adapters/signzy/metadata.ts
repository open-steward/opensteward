export const metadata = {
  platform: 'signzy',
  totalResources: 5,
  availableResources: ['audit-trail-entry', 'envelope', 'signer'],
  unavailableResources: [
    {
      resource: 'document',
      reason:
        'Signzy Contract360 exposes document content only as signed-PDF URLs / base64 / hashes on the pull-contract response; there is no per-document metadata listing endpoint.',
    },
    {
      resource: 'template',
      reason:
        'Signzy Contract360 has no read/list template endpoint; templates are uploaded out-of-band and referenced by id at contract creation only.',
    },
  ],
} as const
