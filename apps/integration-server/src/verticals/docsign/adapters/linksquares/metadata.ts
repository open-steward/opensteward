export const metadata = {
  platform: 'linksquares',
  totalResources: 5,
  availableResources: [
    'document',
    'envelope',
    'template',
  ],
  unavailableResources: [
    {
      resource: 'audit-trail-entry',
      reason: 'The Finalize API documents no activity-log or history endpoint for an agreement',
    },
    {
      resource: 'signer',
      reason:
        'The Finalize API documents no party or signer resource; an agreement\'s _embedded ("Includes the full sub-resource objects") holds only users, questions, token_values and statuses',
    },
  ],
} as const
