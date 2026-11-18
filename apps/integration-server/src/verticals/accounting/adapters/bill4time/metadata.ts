export const metadata = {
  platform: 'bill4time',
  totalResources: 13,
  availableResources: [
    'account',
    'contact',
    'expense',
    'invoice',
    'organization',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'bill',
      reason:
        'Bill4Time is a legal time-billing platform with no AP/vendor-bill concept; no /bills endpoint exists in the v2 API.',
    },
    {
      resource: 'creditmemo',
      reason:
        'Bill4Time does not support credit memos; no credit-memo endpoint exists in the v2 API.',
    },
    {
      resource: 'journal',
      reason:
        'Bill4Time does not expose general-ledger journal entries; no /journals endpoint exists in the v2 API.',
    },
    {
      resource: 'order',
      reason:
        'Bill4Time has no order management concept; no /orders endpoint exists in the v2 API.',
    },
    {
      resource: 'purchaseorder',
      reason:
        'Bill4Time has no purchase-order concept; no /purchaseorders endpoint exists in the v2 API.',
    },
    {
      resource: 'salesorder',
      reason:
        'Bill4Time has no sales-order concept; no /salesorders endpoint exists in the v2 API.',
    },
    {
      resource: 'taxrate',
      reason:
        'Bill4Time does not expose a tax-rate catalogue via its API; no /taxrates endpoint exists in the v2 API.',
    },
  ],
} as const
