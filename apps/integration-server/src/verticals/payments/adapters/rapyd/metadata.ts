export const metadata = {
  platform: 'rapyd',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'dispute',
    'invoice',
    'payment-method',
    'payout',
    'plan',
    'refund',
    'subscription',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'Rapyd has no global balance-transaction ledger endpoint. Wallet transactions are per-ewallet (/v1/ewallets/:ewallet/transactions) and require a known wallet ID; they also omit fee/net fields required by the canonical schema.',
    },
  ],
} as const
