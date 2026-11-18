export const metadata = {
  platform: 'transfi',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'refund',
    'payout',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason: 'TransFi exposes only a merchant account balance endpoint (GET /v3/balance), not a per-transaction ledger; no balance-transaction log API exists.',
    },
    {
      resource: 'dispute',
      reason: 'TransFi has no chargeback or dispute management API; failed orders surface failureCode/failureMessage but there is no dedicated dispute endpoint.',
    },
    {
      resource: 'invoice',
      reason: 'TransFi only provides an invoice upload endpoint (POST /v3/invoices/upload) for attaching documents to orders, not a billing invoice management API.',
    },
    {
      resource: 'payment-method',
      reason: 'TransFi has no stored payment method management API; payment details are submitted per-order with no save/retrieve capability.',
    },
    {
      resource: 'plan',
      reason: 'TransFi is a transfer and cross-border payments API with no subscription plan or pricing plan management features.',
    },
    {
      resource: 'subscription',
      reason: 'TransFi has no subscription management API; the platform handles one-time transfer orders only.',
    },
  ],
} as const
