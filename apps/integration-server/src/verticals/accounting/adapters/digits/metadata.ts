export const metadata = {
  platform: 'digits',
  totalResources: 13,
  availableResources: ['account', 'contact', 'journal', 'organization', 'transaction'],
  unavailableResources: [
    {
      resource: 'bill',
      reason:
        'Digits Connect API has no /bills endpoint; bills are represented only as ledger entries in /ledger/entries.',
    },
    {
      resource: 'creditmemo',
      reason:
        'Digits Connect API has no credit-memo concept or endpoint; credit adjustments appear as ledger entries.',
    },
    {
      resource: 'expense',
      reason:
        'Digits Connect API has no /expenses endpoint; expenses are represented as categorised ledger entries.',
    },
    {
      resource: 'invoice',
      reason:
        'Digits Connect API has no /invoices endpoint; invoice details may be attached to ledger entries but no dedicated resource exists.',
    },
    {
      resource: 'order',
      reason: 'Digits Connect API has no order concept or endpoint.',
    },
    {
      resource: 'purchaseorder',
      reason: 'Digits Connect API has no purchase-order concept or endpoint.',
    },
    {
      resource: 'salesorder',
      reason: 'Digits Connect API has no sales-order concept or endpoint.',
    },
    {
      resource: 'taxrate',
      reason: 'Digits Connect API has no /taxrates endpoint; tax handling is not exposed via the Connect API.',
    },
  ],
} as const
