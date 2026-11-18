export const metadata = {
  platform: 'intasend',
  totalResources: 10,
  availableResources: [
    'charge',
    'refund',
    'customer',
    'invoice',
    'payout',
    'dispute',
    'plan',
    'subscription',
    'balance-transaction',
  ],
  unavailableResources: [
    {
      resource: 'payment-method',
      reason:
        'IntaSend has no dedicated payment-method list/retrieve endpoint; the value appears only as a plain string (e.g. "CARD-PAYMENT") on subscription objects with no tokenised id or card detail object.',
    },
  ],
} as const
