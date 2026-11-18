export const metadata = {
  platform: 'kushki',
  totalResources: 10,
  availableResources: ['charge', 'customer', 'refund', 'subscription'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason: 'No transaction-level balance ledger endpoint; only a scalar merchant-balance query exists',
    },
    {
      resource: 'dispute',
      reason: 'Chargebacks handled via merchant console only; no programmatic API endpoint documented',
    },
    {
      resource: 'invoice',
      reason: 'Kushki has no invoice concept or endpoint; it is a payment gateway, not a billing platform',
    },
    {
      resource: 'payment-method',
      reason: 'UNVERIFIED: No standalone payment-method list endpoint confirmed in public docs; stored cards are addressed via subscription token IDs',
    },
    {
      resource: 'payout',
      reason: 'UNVERIFIED: Payout initiation endpoints confirmed but no public listing/get endpoint for historical payouts found in docs',
    },
    {
      resource: 'plan',
      reason: 'Plans are a string field (planName) on subscriptions, not a first-class API resource with its own endpoints',
    },
  ],
} as const
