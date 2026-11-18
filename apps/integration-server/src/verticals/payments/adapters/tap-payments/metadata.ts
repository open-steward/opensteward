export const metadata = {
  platform: 'tap-payments',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'invoice',
    'payment-method',
    'payout',
    'refund',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'Tap has no balance/ledger transaction REST API; settlement data is only available via payout report CSV download (POST /v2/payouts/download).',
    },
    {
      resource: 'dispute',
      reason:
        'Tap exposes disputes only as a sheet inside payout report CSV downloads; no REST list/retrieve endpoint exists.',
    },
    {
      resource: 'plan',
      reason:
        'Tap has no plan/price/product catalog API; it is a payment gateway, not a subscription billing platform.',
    },
    {
      resource: 'subscription',
      reason:
        'Tap has no dedicated subscriptions endpoint; recurring payments are implemented as standard charges with a payment_agreement parameter on the Charges API.',
    },
  ],
} as const
