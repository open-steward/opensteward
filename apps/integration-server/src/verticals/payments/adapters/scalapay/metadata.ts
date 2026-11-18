export const metadata = {
  platform: 'scalapay',
  totalResources: 10,
  availableResources: ['charge', 'refund', 'payout'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason: 'Scalapay has no balance-transaction or ledger endpoint in the merchant API',
    },
    {
      resource: 'customer',
      reason: 'BNPL gateway; no stored customer objects in the merchant API',
    },
    {
      resource: 'dispute',
      reason: 'BNPL gateway; no chargeback/dispute flow exposed in the merchant API',
    },
    {
      resource: 'invoice',
      reason: 'Scalapay has no invoice resource in the merchant API',
    },
    {
      resource: 'payment-method',
      reason: 'BNPL gateway; no card vault or payment-method store in the merchant API',
    },
    {
      resource: 'plan',
      reason: 'BNPL gateway; no subscription billing or plan resource in the merchant API',
    },
    {
      resource: 'subscription',
      reason: 'BNPL gateway; no subscription resource in the merchant API',
    },
  ],
} as const
