export const metadata = {
  platform: 'juspay',
  totalResources: 10,
  availableResources: [
    'charge',
    'refund',
    'customer',
    'payment-method',
    'subscription',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason: 'Juspay Express Checkout has no ledger or balance transaction API',
    },
    {
      resource: 'dispute',
      reason: 'Juspay Express Checkout has no chargeback or dispute REST API',
    },
    {
      resource: 'invoice',
      reason: 'Juspay has no invoice API; orders are one-time payments and mandates carry no invoicing layer',
    },
    {
      resource: 'plan',
      reason: 'Juspay has no plans or pricing catalog API; mandate amounts are specified per-customer directly',
    },
    {
      resource: 'payout',
      reason: 'UNVERIFIED: Juspay Payouts is a separate product (POST /payout/merchant/v1.1/orders) that uses an encrypted request format not confirmed compatible with Express Checkout credentials',
    },
  ],
} as const
