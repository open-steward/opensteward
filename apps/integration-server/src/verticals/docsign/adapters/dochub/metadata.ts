export const metadata = {
  platform: 'dochub',
  totalResources: 5,
  availableResources: ['document', 'envelope', 'signer', 'template'],
  unavailableResources: [
    {
      resource: 'audit-trail-entry',
      reason:
        'UNVERIFIED: DocHub (dochub.com) has no confirmed public REST API as of June 2026. The developer portal at dochub.com/developers shows "No available documents here". No audit-trail endpoint (or any other API endpoint) could be verified. DocHub exposes audit trails as downloadable PDFs in the UI only.',
    },
  ],
} as const
