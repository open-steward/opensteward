export const metadata = {
  platform: 'bambora',
  totalResources: 10,
  availableResources: ['charge', 'refund', 'customer', 'payment-method'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'Bambora exposes only a daily aggregate settlement report (POST /v1/reports/settlement) with no per-transaction ledger entries, no sourceId, fee, or net per transaction.',
    },
    {
      resource: 'dispute',
      reason:
        'Chargebacks are managed exclusively via the merchant portal; no REST API exists for listing or responding to disputes programmatically.',
    },
    {
      resource: 'invoice',
      reason: 'Bambora has no invoice concept in its Payment API.',
    },
    {
      resource: 'payout',
      reason:
        'Bambora performs automatic bank settlement internally; there is no REST API to list or initiate individual payouts — only an aggregate settlement report is available.',
    },
    {
      resource: 'plan',
      reason:
        'Recurring Billing is a legacy form-POST/querystring API (scripts/recurring_billing.asp) with no REST JSON endpoints and no way to list or retrieve plans.',
    },
    {
      resource: 'subscription',
      reason:
        'Same legacy form-POST recurring billing API; GET/list of recurring accounts is not exposed via a REST endpoint.',
    },
  ],
} as const
