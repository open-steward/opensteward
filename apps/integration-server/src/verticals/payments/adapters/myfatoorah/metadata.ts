export const metadata = {
  platform: 'myfatoorah',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'invoice',
    'payment-method',
    'refund',
    'subscription',
  ],
  unavailableResources: [
    { resource: 'balance-transaction', reason: 'MyFatoorah has no balance/ledger API; settlements are handled operationally via bank agreement' },
    { resource: 'dispute', reason: 'No dispute or chargeback API endpoint; chargebacks are deducted internally by MyFatoorah without programmatic merchant access' },
    { resource: 'payout', reason: 'No payout or settlement API; payouts occur automatically via bank per merchant registration agreement' },
    { resource: 'plan', reason: 'No plan/product/pricing catalog API; recurring payments are amount-based only with no subscription plan concept' },
  ],
} as const
