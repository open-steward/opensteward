export const metadata = {
  platform: 'hitpay',
  totalResources: 10,
  availableResources: [
    'charge',
    'refund',
    'customer',
    'plan',
    'subscription',
    'payout',
  ],
  unavailableResources: [
    {
      resource: 'dispute',
      reason: 'HitPay has no dispute/chargeback REST API; chargebacks are handled via dashboard only.',
    },
    {
      resource: 'balance-transaction',
      reason: 'HitPay /v1/balances returns per-currency wallet totals, not individual ledger transactions.',
    },
    {
      resource: 'invoice',
      reason: 'UNVERIFIED: HitPay documents a POST /v1/invoices create endpoint but no confirmed GET list/retrieve endpoint was found in public docs.',
    },
    {
      resource: 'payment-method',
      reason: 'UNVERIFIED: Saved cards are attached via the recurring-billing save_card flow; no standalone payment-methods list endpoint confirmed in public docs.',
    },
  ],
} as const
