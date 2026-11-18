export const metadata = {
  platform: 'brex',
  totalResources: 13,
  availableResources: [
    'account',
    'bill',
    'contact',
    'expense',
    'organization',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'invoice',
      reason:
        'Brex is a corporate-card/spend platform with no A/R invoice concept or API endpoint.',
    },
    {
      resource: 'creditmemo',
      reason: 'Brex has no credit-memo concept or API endpoint.',
    },
    {
      resource: 'journal',
      reason:
        'Brex does not expose a journal-entry read/write endpoint in its public API; journal data flows only to connected ERPs.',
    },
    {
      resource: 'taxrate',
      reason:
        'Brex has no tax-rate management API; tax codes are configured inside and owned by the connected ERP.',
    },
    {
      resource: 'order',
      reason: 'Brex has no generic order concept or API endpoint.',
    },
    {
      resource: 'salesorder',
      reason: 'Brex has no sales-order concept or API endpoint.',
    },
    {
      resource: 'purchaseorder',
      reason: 'Brex has no purchase-order concept or API endpoint.',
    },
  ],
} as const
