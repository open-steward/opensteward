export const metadata = {
  platform: 'dlocal',
  totalResources: 10,
  availableResources: [
    'charge',
    'refund',
    'payout',
    'dispute',
    'payment-method',
  ],
  unavailableResources: [
    {
      resource: 'customer',
      reason: 'dLocal has no standalone customer/payer CRUD endpoints; the payer object is embedded in payment requests only',
    },
    {
      resource: 'invoice',
      reason: 'dLocal has no invoice object or endpoint',
    },
    {
      resource: 'plan',
      reason: 'dLocal has no plan/price/product catalog endpoints',
    },
    {
      resource: 'subscription',
      reason: 'dLocal recurring payments use wallet-specific enrollment flows (country/method-scoped), not a generic subscription resource',
    },
    {
      resource: 'balance-transaction',
      reason: 'dLocal exposes only an account-level balance for payouts; no per-transaction ledger endpoint exists',
    },
  ],
} as const
