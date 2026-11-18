export const metadata = {
  platform: 'simplbooks',
  totalResources: 13,
  availableResources: [
    'account',
    'bill',
    'contact',
    'creditmemo',
    'expense',
    'invoice',
    'organization',
    'taxrate',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'journal',
      reason:
        'UNVERIFIED: SimplBooks API docs are behind authentication (Premium plan + API key required); cannot confirm whether a journal-entries endpoint exists in the public REST API.',
    },
    {
      resource: 'order',
      reason:
        'UNVERIFIED: SimplBooks API docs are behind authentication (Premium plan + API key required); orders exist as a UI feature but no public documentation confirms a REST endpoint.',
    },
    {
      resource: 'purchaseorder',
      reason:
        'UNVERIFIED: SimplBooks API docs are behind authentication (Premium plan + API key required); purchase orders exist as a UI feature but no public documentation confirms a REST endpoint.',
    },
    {
      resource: 'salesorder',
      reason:
        'UNVERIFIED: SimplBooks API docs are behind authentication (Premium plan + API key required); sales orders/offers exist as a UI feature but no public documentation confirms a REST endpoint.',
    },
  ],
} as const
