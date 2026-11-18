export const metadata = {
  platform: 'paytabs',
  totalResources: 10,
  availableResources: ['charge', 'refund'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'PayTabs has no balance/settlement transaction API; account balances and ledger entries are dashboard-only.',
    },
    {
      resource: 'customer',
      reason:
        'PayTabs has no customer resource; customer details are embedded inside each transaction and cannot be listed or fetched independently.',
    },
    {
      resource: 'dispute',
      reason:
        'PayTabs has no dispute/chargeback API; chargebacks are managed exclusively through the merchant dashboard.',
    },
    {
      resource: 'invoice',
      reason:
        'The POST /payment/invoice/new endpoint creates a hosted-payment-page redirect URL (invoice_id + invoice_link only); there is no list or get endpoint that returns queryable invoice data matching the canonical schema.',
    },
    {
      resource: 'payment-method',
      reason:
        'PayTabs has no payment method resource; card and wallet details are embedded in each transaction response and cannot be listed or managed independently.',
    },
    {
      resource: 'payout',
      reason:
        'The POST /payout/batch/new endpoint is a bulk B2B batch-transfer mechanism (batch_id, account_id, requests[]) whose schema cannot be mapped to the canonical Payout resource.',
    },
    {
      resource: 'plan',
      reason:
        'PayTabs has no plan or pricing catalog resource; repeat-billing parameters (repeat_amount, repeat_period, etc.) are inline fields on each /payment/request call.',
    },
    {
      resource: 'subscription',
      reason:
        'Repeat Billing agreements are created via POST /payment/request; there is no list or get API for existing agreements, and agreement data is not returned in a form mappable to the canonical Subscription schema.',
    },
  ],
} as const
