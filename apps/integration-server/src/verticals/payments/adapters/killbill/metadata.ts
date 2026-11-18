export const metadata = {
  platform: 'killbill',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'invoice',
    'payment-method',
    'plan',
    'refund',
    'subscription',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'Kill Bill has no balance-transaction concept; it is an open-source billing engine, not a hosted payment gateway',
    },
    {
      resource: 'dispute',
      reason:
        'Chargebacks are write-only (POST /1.0/kb/payments/{id}/chargebacks); no list or get endpoint exists for disputes',
    },
    {
      resource: 'payout',
      reason:
        'Kill Bill has no payout concept; payouts are managed by the underlying payment plugin/gateway, not Kill Bill itself',
    },
  ],
} as const
