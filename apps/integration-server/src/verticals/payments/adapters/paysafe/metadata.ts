export const metadata = {
  platform: 'paysafe',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'refund',
    'plan',
    'subscription',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason: 'Paysafe exposes no balance/ledger REST endpoint; reporting is portal-only',
    },
    {
      resource: 'dispute',
      reason: 'Chargebacks are managed via the Business Portal only; no programmatic REST dispute API is documented',
    },
    {
      resource: 'invoice',
      reason: 'Paysafe has no invoice concept in its REST API',
    },
    {
      resource: 'payment-method',
      reason: 'Payment handles require a customerId per-request (GET /paymenthub/v1/customers/{id}/paymenthandles); no flat list endpoint across all customers is documented',
    },
    {
      resource: 'payout',
      reason: 'standalonecredits is write-only (POST); no confirmed GET list endpoint for payouts is documented',
    },
  ],
} as const
