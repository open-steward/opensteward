export const metadata = {
  platform: 'braintree',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'dispute',
    'payment-method',
    'plan',
    'refund',
    'subscription',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'Braintree has no balance-transaction concept in its GraphQL API; the schema contains no BalanceTransaction type. The REST Settlement Batch Summary is a date-aggregate report, not a per-transaction ledger entry.',
    },
    {
      resource: 'invoice',
      reason:
        'Braintree has no invoice object. "Pay Upon Invoice" is a payment-method type embedded within transactions, not a queryable resource; confirmed via GraphQL schema and official docs.',
    },
    {
      resource: 'payout',
      reason:
        'Braintree disbursements are webhook-only; there is no REST or GraphQL endpoint to list or fetch disbursement/payout objects. Confirmed: no Payout or Disbursement type exists in the GraphQL schema.',
    },
  ],
} as const
