export const metadata = {
  platform: 'coingate',
  totalResources: 10,
  availableResources: ['charge', 'refund', 'payout'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'UNVERIFIED: GET /v2/ledger/transactions endpoint confirmed to exist but response field schema could not be verified from public docs.',
    },
    {
      resource: 'customer',
      reason:
        'CoinGate has no standalone customer resource; shopper data is embedded on the order.',
    },
    {
      resource: 'dispute',
      reason:
        'Crypto payments are immutable on-chain; CoinGate has no dispute concept or endpoint.',
    },
    {
      resource: 'invoice',
      reason:
        'UNVERIFIED: GET /v2/billing/requests endpoint exists (invoice-like billing requests) but response field schema could not be verified from public docs.',
    },
    {
      resource: 'payment-method',
      reason:
        'Crypto-only gateway; no traditional card/bank payment method storage.',
    },
    {
      resource: 'plan',
      reason: 'No subscription plan/pricing catalog in CoinGate\'s API.',
    },
    {
      resource: 'subscription',
      reason:
        'UNVERIFIED: GET /billing/subscriptions endpoint referenced in docs index but reference page returns 404; schema unverifiable.',
    },
  ],
} as const
