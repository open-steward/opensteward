export const metadata = {
  platform: 'midtrans',
  totalResources: 10,
  availableResources: [
    'charge',
    'refund',
    'subscription',
    'invoice',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason: 'Midtrans has no balance/ledger transaction API; the Core API only exposes individual charge statuses',
    },
    {
      resource: 'customer',
      reason: 'Midtrans is transaction-centric; no customer management endpoints exist in the Core API',
    },
    {
      resource: 'dispute',
      reason: 'Midtrans surfaces fraud outcomes as fraud_status on the transaction object, not as a standalone disputes API',
    },
    {
      resource: 'payment-method',
      reason: 'Midtrans uses per-transaction tokens, not a stored/listable payment methods API',
    },
    {
      resource: 'payout',
      reason: 'Iris payout API requires a separate host (app.midtrans.com/iris) and dedicated Iris credentials not shared with the Core API Server Key',
    },
    {
      resource: 'plan',
      reason: 'Midtrans Subscription API embeds schedule configuration inline; no named plan, price, or product catalog resources exist',
    },
  ],
} as const
