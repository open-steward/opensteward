export const metadata = {
  platform: 'spreedly',
  totalResources: 10,
  availableResources: [
    'charge',
    'payment-method',
    'refund',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'Spreedly is a payment-orchestration vault layer; it has no ledger or balance-transaction concept.',
    },
    {
      resource: 'customer',
      reason:
        'Spreedly vaults payment methods, not customers — there is no /customers endpoint in the API.',
    },
    {
      resource: 'dispute',
      reason:
        'Spreedly does not expose dispute or chargeback resources; disputes are managed by the downstream gateway.',
    },
    {
      resource: 'invoice',
      reason:
        'Spreedly has no invoicing or billing-lifecycle concept; no /invoices endpoint exists.',
    },
    {
      resource: 'payout',
      reason:
        'Spreedly does not model payouts — settlement is managed by the downstream gateway, not Spreedly.',
    },
    {
      resource: 'plan',
      reason:
        'Spreedly sold its subscription product to Pin Payments; no plan/price/product endpoints exist in the current API.',
    },
    {
      resource: 'subscription',
      reason:
        'Spreedly sold its subscription product to Pin Payments; no subscription management endpoints exist in the current API.',
    },
  ],
} as const
