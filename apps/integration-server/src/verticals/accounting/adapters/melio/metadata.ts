export const metadata = {
  platform: 'melio',
  totalResources: 13,
  availableResources: [
    'bill',
    'contact',
    'invoice',
    'organization',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'account',
      reason:
        'Melio is a payments platform (AP/AR), not a ledger; it has no chart-of-accounts endpoint. It syncs to QuickBooks/Xero rather than maintaining its own accounts.',
    },
    {
      resource: 'creditmemo',
      reason:
        'Melio has no credit memo concept in its API; credit adjustments are handled by the connected accounting system (QuickBooks/Xero).',
    },
    {
      resource: 'expense',
      reason:
        'Melio has no expense-report endpoint; its scope covers vendor bills and payments only.',
    },
    {
      resource: 'journal',
      reason:
        'Melio has no journal-entry endpoint; double-entry bookkeeping is delegated to the connected accounting system.',
    },
    {
      resource: 'order',
      reason:
        'Melio has no order concept in its API; it is a bill-pay and invoicing platform, not an order management system.',
    },
    {
      resource: 'purchaseorder',
      reason:
        'Melio has no purchase-order endpoint; purchase orders are managed in the connected ERP or accounting system.',
    },
    {
      resource: 'salesorder',
      reason:
        'Melio has no sales-order endpoint; it provides invoicing (AR) but not order management.',
    },
    {
      resource: 'taxrate',
      reason:
        'Melio has no tax-rate endpoint; tax configuration and calculation is owned by the connected accounting system.',
    },
  ],
} as const
