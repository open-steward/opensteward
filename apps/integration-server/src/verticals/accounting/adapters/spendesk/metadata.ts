export const metadata = {
  platform: 'spendesk',
  totalResources: 13,
  availableResources: [
    'account',
    'contact',
    'creditmemo',
    'expense',
    'invoice',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'bill',
      reason:
        'No dedicated bill endpoint. AP invoices are surfaced via listInvoices (type=invoicePurchase payables). A separate bill resource would duplicate that data.',
    },
    {
      resource: 'journal',
      reason: 'Spendesk public API has no journal or journal-entry endpoint.',
    },
    {
      resource: 'order',
      reason: 'Spendesk public API has no generic order endpoint.',
    },
    {
      resource: 'organization',
      reason: 'Spendesk public API does not expose a company or organization endpoint.',
    },
    {
      resource: 'purchaseorder',
      reason:
        'Purchase orders exist as a UI workflow in Spendesk but the public API exposes no /v1/purchase-orders endpoint.',
    },
    {
      resource: 'salesorder',
      reason:
        'Spendesk is an AP/spend-management platform; sales orders are not a platform concept and no endpoint exists.',
    },
    {
      resource: 'taxrate',
      reason: 'Tax rates are not exposed as a resource through the Spendesk public API.',
    },
  ],
} as const
