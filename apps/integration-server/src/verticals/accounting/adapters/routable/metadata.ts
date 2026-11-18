export const metadata = {
  platform: 'routable',
  totalResources: 13,
  availableResources: [
    'account',
    'bill',
    'contact',
    'invoice',
    'organization',
  ],
  unavailableResources: [
    {
      resource: 'creditmemo',
      reason: 'Routable has no credit memo concept; it is an AP/AR automation platform, not a full accounting system',
    },
    {
      resource: 'expense',
      reason: 'No expense management feature in the Routable API',
    },
    {
      resource: 'journal',
      reason: 'No journal entry endpoints in the Routable API',
    },
    {
      resource: 'order',
      reason: 'No order concept in the Routable API',
    },
    {
      resource: 'purchaseorder',
      reason: 'No purchase order endpoints; payables (Bills) serve the AP role',
    },
    {
      resource: 'salesorder',
      reason: 'No sales order endpoints; receivables (Invoices) serve the AR role',
    },
    {
      resource: 'taxrate',
      reason: 'Tax codes are available only via the /v1/accounting-software/objects proxy which requires a connected third-party accounting system (QuickBooks, Xero, etc.), not a native Routable resource',
    },
    {
      resource: 'transaction',
      reason: 'No queryable transaction listing endpoint; payment events are delivered via webhooks only',
    },
  ],
} as const
