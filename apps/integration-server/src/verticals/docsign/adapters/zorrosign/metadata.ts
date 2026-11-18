export const metadata = {
  platform: 'zorrosign',
  totalResources: 5,
  availableResources: ['envelope', 'template'],
  unavailableResources: [
    {
      resource: 'audit-trail-entry',
      reason:
        'UNVERIFIED: ZorroSign API docs are inaccessible (ECONNREFUSED for api.zorrosign.com and www.zorrosign.com); no public documentation confirming or denying a REST audit-trail endpoint could be retrieved.',
    },
    {
      resource: 'document',
      reason:
        'Its API documents no recipients or documents resource, only "Get Process Status, Details, Full Details, and All Processes"',
    },
    {
      resource: 'signer',
      reason:
        'Its API documents no recipients or documents resource, only "Get Process Status, Details, Full Details, and All Processes"',
    },
  ],
} as const
