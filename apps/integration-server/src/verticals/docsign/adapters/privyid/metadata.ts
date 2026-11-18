export const metadata = {
  platform: 'privyid',
  totalResources: 5,
  availableResources: ['envelope', 'signer', 'document'],
  unavailableResources: [
    {
      resource: 'audit-trail-entry',
      reason:
        'The Privy merchant API exposes no audit-trail or activity-log endpoint. Status changes are delivered via merchant callbacks only; there is no queryable per-document event history.',
    },
    {
      resource: 'template',
      reason:
        'The Privy merchant API has no template concept. Merchants upload one-off documents on each request; no template management or listing endpoint exists in the documented API.',
    },
  ],
} as const
