export const metadata = {
  platform: 'telr',
  totalResources: 10,
  availableResources: ['charge', 'customer', 'refund'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason: 'Telr has no dedicated balance-transaction API endpoint; ledger entries are not exposed as a REST resource.',
    },
    {
      resource: 'dispute',
      reason: 'Telr has no dedicated dispute/chargeback API endpoint; chargebacks are handled outside the REST API.',
    },
    {
      resource: 'plan',
      reason: 'Telr has no plan catalog endpoint; recurring billing parameters are embedded in order creation requests, not exposed as listable plan objects.',
    },
    {
      resource: 'subscription',
      reason: 'Telr repeat billing agreements cannot be listed or retrieved as subscription objects via REST; they are initiated via order creation parameters (repeat_amount, repeat_period, etc.) with no list/get endpoint.',
    },
    {
      resource: 'invoice',
      reason: 'UNVERIFIED: Telr has an invoice creation endpoint but its list/get endpoint and response field names are not publicly documented without authenticated dashboard access.',
    },
    {
      resource: 'payment-method',
      reason: 'UNVERIFIED: Telr supports stored cards but the list/get endpoint for saved payment methods and its response field names are not publicly documented without authenticated dashboard access.',
    },
    {
      resource: 'payout',
      reason: 'UNVERIFIED: Telr Accounts API has GET /api/v1/accounts/{accountId}/payouts but the response JSON field names are not publicly documented (only "200 application/json" is shown in interactive docs).',
    },
  ],
} as const
