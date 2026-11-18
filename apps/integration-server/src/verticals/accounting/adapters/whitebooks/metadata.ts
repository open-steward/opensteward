export const metadata = {
  platform: 'whitebooks',
  totalResources: 13,
  availableResources: ['contact', 'invoice', 'organization'],
  unavailableResources: [
    {
      resource: 'account',
      reason:
        'WhiteBooks public API covers only e-Invoice, GST return filing, GSTIN lookup, and HSN/SAC code search — no chart-of-accounts endpoint exists.',
    },
    {
      resource: 'bill',
      reason:
        'WhiteBooks public API has no accounts-payable or bills endpoint; the API is limited to e-Invoice (IRN) and GST compliance operations.',
    },
    {
      resource: 'creditmemo',
      reason:
        'WhiteBooks public API has no credit-note or credit-memo endpoint; IRN cancellation is the only reversal mechanism exposed.',
    },
    {
      resource: 'expense',
      reason:
        'WhiteBooks public API has no expense-management endpoint; expense features exist in the SaaS UI but are not exposed via REST.',
    },
    {
      resource: 'journal',
      reason:
        'WhiteBooks public API has no journal-entry endpoint; double-entry ledger data is not accessible via the documented REST API.',
    },
    {
      resource: 'order',
      reason:
        'WhiteBooks public API has no generic order endpoint; order management exists in the SaaS UI but is not exposed via REST.',
    },
    {
      resource: 'purchaseorder',
      reason:
        'WhiteBooks public API has no purchase-order endpoint; the feature exists in the SaaS product but is not accessible via the documented REST API.',
    },
    {
      resource: 'salesorder',
      reason:
        'WhiteBooks public API has no sales-order endpoint; the feature exists in the SaaS product but is not accessible via the documented REST API.',
    },
    {
      resource: 'taxrate',
      reason:
        'WhiteBooks public API exposes an HSN/SAC government code lookup (GET /api/v1/hsn-sac/search) but has no endpoint for user-configured tax rates.',
    },
    {
      resource: 'transaction',
      reason:
        'WhiteBooks public API has no transaction or payment ledger endpoint; financial transaction data is not exposed via the documented REST API.',
    },
  ],
} as const
