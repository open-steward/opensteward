export const metadata = {
  platform: 'asaas',
  totalResources: 10,
  availableResources: [
    'balance-transaction',
    'charge',
    'customer',
    'dispute',
    'invoice',
    'payout',
    'refund',
    'subscription',
  ],
  unavailableResources: [
    {
      resource: 'payment-method',
      reason:
        'Asaas uses per-transaction card tokens (creditCardToken returned from /creditCard/tokenize); there is no endpoint to list or retrieve saved payment methods for a customer.',
    },
    {
      resource: 'plan',
      reason:
        'Asaas has no plan, price, or product catalog; subscriptions define their recurring amount and cycle inline. No /plans or /products endpoint exists.',
    },
  ],
} as const
