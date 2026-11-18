export const metadata = {
  platform: 'ccavenue',
  totalResources: 10,
  availableResources: ['charge', 'refund'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'CCAvenue DoWebTrans servlet exposes no balance ledger or settlement-entry endpoint; financial summaries are dashboard-only.',
    },
    {
      resource: 'customer',
      reason:
        'CCAvenue has no server-side customer object; billing/shipping data is collected via a browser redirect and is not queryable via DoWebTrans.',
    },
    {
      resource: 'dispute',
      reason:
        'CCAvenue has no DoWebTrans command for querying or responding to chargebacks/disputes; disputes are handled exclusively in the M.A.R.S merchant dashboard.',
    },
    {
      resource: 'invoice',
      reason:
        'CCAvenue has no invoice concept in its DoWebTrans API; it is a payment-capture gateway without a billing/invoicing layer.',
    },
    {
      resource: 'payment-method',
      reason:
        'CCAvenue does not expose stored payment-method (card/wallet token) records via the DoWebTrans servlet; no list or get command exists.',
    },
    {
      resource: 'payout',
      reason:
        'CCAvenue settlement/payout data is accessible only via the merchant dashboard reports, not via any DoWebTrans command.',
    },
    {
      resource: 'plan',
      reason:
        'CCAvenue subscription plan management is a merchant-dashboard feature; no DoWebTrans command exposes plan/price/product records.',
    },
    {
      resource: 'subscription',
      reason:
        'CCAvenue recurring-payment subscriptions are managed through its dashboard SI-mandate flow; no DoWebTrans command exists to list or query subscriptions.',
    },
  ],
} as const
