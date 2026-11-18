export const metadata = {
  platform: 'kashflow',
  totalResources: 13,
  availableResources: [
    'account',
    'bill',
    'contact',
    'creditmemo',
    'invoice',
    'organization',
    'taxrate',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'expense',
      reason:
        'KashFlow REST API v2 has no expense/receipt endpoint; receipts exist only in the SOAP API (InsertReceipt/GetReceipts). No REST equivalent.',
    },
    {
      resource: 'journal',
      reason:
        'KashFlow REST API v2 has no journal endpoint; journals exist only in the SOAP API (GetJournals/InsertJournal). The JournalEnabled user-settings flag confirms the feature but only via SOAP.',
    },
    {
      resource: 'order',
      reason:
        'KashFlow has no order concept in its REST API v2. Quotes (/quotes) are estimates/proposals, not orders, and have no order-status or fulfilment semantics.',
    },
    {
      resource: 'purchaseorder',
      reason:
        'KashFlow REST API v2 has no purchase-order endpoint; purchase orders are a UI-only feature with no documented REST resource.',
    },
    {
      resource: 'salesorder',
      reason:
        'KashFlow REST API v2 has no sales-order endpoint; the platform uses Quotes (/quotes) for pre-sale documents, which are not equivalent to sales orders.',
    },
  ],
} as const
