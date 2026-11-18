export const metadata = {
  platform: 'firefly-iii',
  totalResources: 13,
  availableResources: [
    'account',
    'bill',
    'journal',
    'organization',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'contact',
      reason:
        'Firefly III is a personal finance manager with no concept of contacts or customers; the /v1 API has no contact/customer endpoints (confirmed via routes/api.php in firefly-iii/firefly-iii).',
    },
    {
      resource: 'creditmemo',
      reason:
        'Firefly III has no invoicing or credit note concepts; the /v1 API has no credit memo endpoints.',
    },
    {
      resource: 'expense',
      reason:
        'Firefly III has no expense-report or expense-claim resource; /v1/insight/expense/* are read-only analytics aggregates over transactions, not CRUD expense records.',
    },
    {
      resource: 'invoice',
      reason:
        'Firefly III is a personal finance manager with no invoicing capability; the /v1 API has no invoice endpoints.',
    },
    {
      resource: 'order',
      reason:
        'Firefly III has no order management; the /v1 API has no order endpoints.',
    },
    {
      resource: 'purchaseorder',
      reason:
        'Firefly III has no purchase order management; the /v1 API has no purchase order endpoints.',
    },
    {
      resource: 'salesorder',
      reason:
        'Firefly III has no sales order management; the /v1 API has no sales order endpoints.',
    },
    {
      resource: 'taxrate',
      reason:
        'Firefly III does not model tax rates; the /v1 API has no tax rate endpoints (a community feature request for transaction-level tax fields remains unimplemented as of the latest release).',
    },
  ],
} as const
