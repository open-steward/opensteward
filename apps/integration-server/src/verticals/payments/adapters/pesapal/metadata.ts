export const metadata = {
  platform: 'pesapal',
  totalResources: 10,
  availableResources: ['charge', 'customer', 'refund'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'Pesapal v3 API provides no balance/ledger endpoint; settlement reporting is not exposed via REST.',
    },
    {
      resource: 'dispute',
      reason:
        'Pesapal v3 API has no dispute management endpoint; chargeback handling is not exposed via REST.',
    },
    {
      resource: 'invoice',
      reason:
        'Pesapal v3 API has no invoice endpoint; account_number on SubmitOrderRequest is an opaque reference, not a queryable invoice resource.',
    },
    {
      resource: 'payment-method',
      reason:
        'Pesapal v3 API has no stored payment-method management endpoint; only a masked payment_account string is returned in GetTransactionStatus.',
    },
    {
      resource: 'payout',
      reason:
        'Pesapal v3 API has no payout/settlement endpoint; merchant payouts are handled outside the API.',
    },
    {
      resource: 'plan',
      reason:
        'Pesapal v3 API has no plan/price/product catalog endpoint; recurring frequency is a parameter on SubmitOrderRequest, not a first-class resource.',
    },
    {
      resource: 'subscription',
      reason:
        'Pesapal v3 API has no subscription list/get endpoint; recurring payment metadata appears only inside GetTransactionStatus responses, not as a queryable resource.',
    },
  ],
} as const
