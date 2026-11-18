export const metadata = {
  platform: 'dext',
  totalResources: 13,
  availableResources: ['organization'],
  unavailableResources: [
    {
      resource: 'account',
      reason:
        'Dext Precision API (api.precision.dext.com) exposes only /clients and /clients/{clientId}/activity-stats — no chart-of-accounts endpoint exists.',
    },
    {
      resource: 'bill',
      reason:
        'Dext Precision API has no bill/payable-document endpoints; activity-stats surfaces aggregate bill counts only.',
    },
    {
      resource: 'contact',
      reason:
        'Dext Precision API exposes no contact/supplier/customer endpoints; the platform is a practice management layer, not a ledger.',
    },
    {
      resource: 'creditmemo',
      reason:
        'Dext Precision API has no credit-memo or credit-note endpoints.',
    },
    {
      resource: 'expense',
      reason:
        'Dext Precision API has no expense endpoints; expense capture is handled by Dext Prepare (a separate product with no public API).',
    },
    {
      resource: 'invoice',
      reason:
        'Dext Precision API has no invoice endpoints; it surfaces aggregate invoice counts via activity-stats only.',
    },
    {
      resource: 'journal',
      reason:
        'Dext Precision API has no journal-entry endpoints.',
    },
    {
      resource: 'order',
      reason:
        'Dext Precision API has no order endpoints.',
    },
    {
      resource: 'purchaseorder',
      reason:
        'Dext Precision API has no purchase-order endpoints.',
    },
    {
      resource: 'salesorder',
      reason:
        'Dext Precision API has no sales-order endpoints.',
    },
    {
      resource: 'taxrate',
      reason:
        'Dext Precision API has no tax-rate endpoints.',
    },
    {
      resource: 'transaction',
      reason:
        'Dext Precision API has no transaction endpoints; bank transaction counts appear in activity-stats only.',
    },
  ],
} as const
