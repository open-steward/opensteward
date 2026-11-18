export const metadata = {
  platform: 'verifone-2checkout',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'invoice',
    'payment-method',
    'payout',
    'plan',
    'refund',
    'subscription',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        '2Checkout REST 6.0 has no pageable ledger endpoint; /payouts/pending/ is a balance snapshot only, not a transaction log.',
    },
    {
      resource: 'dispute',
      reason:
        '2Checkout has no REST endpoint for chargebacks/disputes; they are surfaced only via IPN webhooks and as aggregate amounts within payout summaries.',
    },
  ],
} as const
