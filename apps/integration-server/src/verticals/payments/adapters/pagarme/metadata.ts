export const metadata = {
  platform: 'pagarme',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'refund',
    'subscription',
    'invoice',
    'plan',
    'payment-method',
    'balance-transaction',
    'payout',
  ],
  unavailableResources: [
    {
      resource: 'dispute',
      reason:
        'Pagar.me v5 has no dedicated dispute/chargeback list endpoint; chargebacks surface as a "chargedback" status value on the Charge object and are delivered via webhooks only.',
    },
  ],
} as const
