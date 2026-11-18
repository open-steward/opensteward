export const metadata = {
  platform: 'paytr',
  totalResources: 10,
  availableResources: ['charge', 'customer', 'refund'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'PayTR provides only aggregate daily payment-summary reports (paytr.com/rapor/odeme-dokumu); no per-transaction ledger/balance-transaction endpoint exists.',
    },
    {
      resource: 'dispute',
      reason:
        'PayTR has no public API for dispute or chargeback management; chargebacks are handled offline by PayTR support.',
    },
    {
      resource: 'invoice',
      reason:
        'PayTR has no invoice resource or API; it is a payment-processing gateway with no invoicing layer.',
    },
    {
      resource: 'payment-method',
      reason:
        'PayTR Card Storage API stores cards for recurring charges but exposes no queryable payment-method list/get endpoint in the public REST API.',
    },
    {
      resource: 'payout',
      reason:
        'PayTR settles funds to the merchant IBAN automatically; there is no payout API to list or retrieve payout records.',
    },
    {
      resource: 'plan',
      reason:
        'PayTR has no billing-plan objects; recurring payments are merchant-initiated charges against stored cards, not plan-based subscriptions.',
    },
    {
      resource: 'subscription',
      reason:
        'PayTR has no subscription resource; recurring billing is implemented by the merchant storing a card and issuing periodic charge requests, with no subscription management API.',
    },
  ],
} as const
