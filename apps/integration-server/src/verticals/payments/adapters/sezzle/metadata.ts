export const metadata = {
  platform: 'sezzle',
  totalResources: 10,
  availableResources: ['charge', 'customer', 'payout', 'refund'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'No balance-transaction list endpoint; GET /v2/interest/balance returns a single scalar, not a transaction history',
    },
    {
      resource: 'dispute',
      reason:
        'Sezzle has no dispute/chargeback API endpoint; chargebacks appear only in settlement CSV reports',
    },
    {
      resource: 'invoice',
      reason: 'Sezzle has no invoice concept or endpoint',
    },
    {
      resource: 'payment-method',
      reason:
        'Sezzle is BNPL-only; tokenized customers carry no card/bank-account data; no dedicated payment-method endpoint',
    },
    {
      resource: 'plan',
      reason: 'Sezzle has no subscription plans or recurring billing concept',
    },
    {
      resource: 'subscription',
      reason: 'Sezzle has no subscription concept or endpoint',
    },
  ],
} as const
