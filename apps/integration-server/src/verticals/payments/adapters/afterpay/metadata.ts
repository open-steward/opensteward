export const metadata = {
  platform: 'afterpay',
  totalResources: 10,
  availableResources: ['charge', 'refund', 'dispute'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason: 'Afterpay has no merchant ledger/balance API; no settlement account concept exposed to merchants',
    },
    {
      resource: 'customer',
      reason: 'Afterpay embeds consumer info inside payment records; no persistent customer objects or customer CRUD API',
    },
    {
      resource: 'invoice',
      reason: 'Afterpay is a BNPL installment service; no invoice model exists in their merchant API',
    },
    {
      resource: 'payment-method',
      reason: 'Payment methods are internal to Afterpay; no payment-method management API is exposed to merchants',
    },
    {
      resource: 'payout',
      reason: 'Afterpay settles directly to merchant bank accounts; no payouts API endpoint is available',
    },
    {
      resource: 'plan',
      reason: 'Afterpay uses a fixed 4-installment model; no configurable plan or product catalog API',
    },
    {
      resource: 'subscription',
      reason: 'No merchant subscription management REST API; consumer-facing subscription feature is not API-accessible',
    },
  ],
} as const
