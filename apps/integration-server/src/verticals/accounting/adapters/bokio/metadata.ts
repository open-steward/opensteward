/**
 * Which canonical accounting resources Bokio's Company API offers. The
 * unavailable ones were checked against the full endpoint index,
 * https://docs.bokio.se/llms.txt, on 2026-09-29.
 */
export const metadata = {
  platform: 'bokio',
  totalResources: 13,
  availableResources: [
    'account',
    'bill',
    'contact',
    'creditmemo',
    'invoice',
    'journal',
    'organization',
  ],
  unavailableResources: [
    {
      resource: 'expense',
      reason:
        'Bokio uploads carry no amount, date or account; booked receipts appear as journal entries',
    },
    {
      resource: 'order',
      reason: 'Bokio has no order, quote or purchase-order endpoint',
    },
    {
      resource: 'purchaseorder',
      reason: 'Bokio has no order, quote or purchase-order endpoint',
    },
    {
      resource: 'salesorder',
      reason: 'Bokio has no order, quote or purchase-order endpoint',
    },
    {
      resource: 'taxrate',
      reason: 'VAT exists only as a per-line taxRate on invoices',
    },
    {
      resource: 'transaction',
      reason:
        "Bokio's API excludes bank transactions; journal entries are ledger postings, not transactions",
    },
  ],
} as const
