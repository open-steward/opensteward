export const metadata = {
  platform: 'puzzle',
  totalResources: 13,
  availableResources: [
    'account',
    'bill',
    'contact',
    'invoice',
    'journal',
    'organization',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'creditmemo',
      reason: 'Puzzle public API has no credit memo endpoint; the platform does not expose this concept via REST.',
    },
    {
      resource: 'expense',
      reason: 'Puzzle exposes only aggregate expense metrics (a reporting endpoint), not individual expense records with id/amount/vendor fields.',
    },
    {
      resource: 'order',
      reason: 'Puzzle public API has no order endpoint; orders are not a supported concept in this platform.',
    },
    {
      resource: 'purchaseorder',
      reason: 'Puzzle public API has no purchase order endpoint; purchase orders are not a supported concept in this platform.',
    },
    {
      resource: 'salesorder',
      reason: 'Puzzle public API has no sales order endpoint; sales orders are not a supported concept in this platform.',
    },
    {
      resource: 'taxrate',
      reason: 'Puzzle public API has no tax rate management endpoint; tax rates are not exposed via REST.',
    },
  ],
} as const
