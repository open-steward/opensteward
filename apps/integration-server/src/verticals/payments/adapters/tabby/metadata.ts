export const metadata = {
  platform: 'tabby',
  totalResources: 10,
  availableResources: ['charge', 'refund', 'dispute'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason: 'Tabby has no balance/ledger transaction API',
    },
    {
      resource: 'customer',
      reason: 'Buyer is embedded in the payment object; no standalone customer resource',
    },
    {
      resource: 'invoice',
      reason: 'Tabby has no invoice concept in its API',
    },
    {
      resource: 'payment-method',
      reason: 'Tabby has no payment method management API',
    },
    {
      resource: 'payout',
      reason: 'Tabby has no payout/settlement API',
    },
    {
      resource: 'plan',
      reason: 'Tabby is BNPL only; no subscription plan/pricing API',
    },
    {
      resource: 'subscription',
      reason: 'Tabby is BNPL only; no recurring subscription API',
    },
  ],
} as const
