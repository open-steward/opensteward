export const metadata = {
  platform: 'flutterwave',
  totalResources: 10,
  availableResources: [
    'balance-transaction',
    'charge',
    'customer',
    'dispute',
    'payout',
    'plan',
    'refund',
    'subscription',
  ],
  unavailableResources: [
    {
      resource: 'invoice',
      reason: 'Flutterwave invoices are a dashboard-only feature; no /v3/invoices REST endpoint exists.',
    },
    {
      resource: 'payment-method',
      reason: 'No list/retrieve endpoint for stored payment methods; card tokens are embedded in transaction responses only.',
    },
  ],
} as const
