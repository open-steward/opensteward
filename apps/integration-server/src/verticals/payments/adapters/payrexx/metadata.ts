export const metadata = {
  platform: 'payrexx',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'refund',
    'subscription',
    'invoice',
    'payout',
    'payment-method',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason: 'Payrexx has no dedicated balance-transaction ledger endpoint; payout transfers array provides partial data but no canonical balance-transaction resource',
    },
    {
      resource: 'dispute',
      reason: 'No dispute/chargeback endpoint found in Payrexx REST API docs or PHP SDK',
    },
    {
      resource: 'plan',
      reason: 'Payrexx has no catalog-style plan/price/product endpoint; subscriptions are parameter-driven on the Gateway/Invoice, not stored catalog items',
    },
  ],
} as const
