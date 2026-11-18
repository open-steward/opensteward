export const metadata = {
  platform: 'cielo',
  totalResources: 10,
  availableResources: ['charge', 'refund'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'Cielo has no ledger or balance-transaction API; financial settlement is managed via the Cielo portal, not a REST endpoint.',
    },
    {
      resource: 'customer',
      reason:
        'Cielo has no standalone customer object; buyer details (name, email) are embedded in each sale and cannot be listed or managed independently.',
    },
    {
      resource: 'dispute',
      reason:
        'Cielo has no REST endpoint for dispute/chargeback management; chargebacks are handled through the Cielo merchant portal.',
    },
    {
      resource: 'invoice',
      reason:
        'Cielo has no invoicing API; the platform is a card acquirer with no invoice creation or retrieval endpoints.',
    },
    {
      resource: 'payment-method',
      reason:
        'Cielo supports card tokenization within transactions but exposes no REST endpoint to list, get, or manage stored payment methods independently.',
    },
    {
      resource: 'payout',
      reason:
        'Cielo has no payout or settlement API; merchant settlements are handled internally and not exposed via REST.',
    },
    {
      resource: 'plan',
      reason:
        'Cielo has no subscription plan or price catalog API; recurring billing is configured as per-transaction flags, not as listable plan objects.',
    },
    {
      resource: 'subscription',
      reason:
        'Cielo has no list endpoint for recurrent payments; GET /1/RecurrentPayment/{id} is a point-lookup only and there is no enumerable subscription surface.',
    },
  ],
} as const
