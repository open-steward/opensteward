export const metadata = {
  platform: 'dodo-payments',
  totalResources: 10,
  availableResources: [
    'balance-transaction',
    'charge',
    'customer',
    'dispute',
    'payment-method',
    'payout',
    'refund',
    'subscription',
  ],
  unavailableResources: [
    {
      resource: 'invoice',
      reason:
        'GET /invoices/payments/{payment_id} returns a PDF binary (application/pdf) only; there is no structured JSON invoice object in the Dodo Payments API.',
    },
    {
      resource: 'plan',
      reason:
        'Dodo Payments has no separate Plan/Price catalog endpoint; subscription pricing is embedded in Product objects, which are covered by listProducts/getProduct.',
    },
  ],
} as const
