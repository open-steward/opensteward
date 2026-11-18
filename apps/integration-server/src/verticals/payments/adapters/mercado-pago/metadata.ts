export const metadata = {
  platform: 'mercado-pago',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'dispute',
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
        'Mercado Pago exposes balance data only via downloadable CSV settlement reports (/v1/account/settlement_report); there is no queryable REST endpoint for individual balance-transaction records.',
    },
  ],
} as const
