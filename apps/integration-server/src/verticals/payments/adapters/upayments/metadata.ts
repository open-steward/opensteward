export const metadata = {
  platform: 'upayments',
  totalResources: 10,
  availableResources: ['charge', 'customer', 'refund'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason: 'UPayments has no balance-transaction API; ledger entries are not exposed via REST',
    },
    {
      resource: 'dispute',
      reason: 'UPayments has no dispute management API; chargebacks are handled outside the REST API',
    },
    {
      resource: 'invoice',
      reason: 'Only a create-invoice endpoint exists; there are no list or get invoice endpoints',
    },
    {
      resource: 'payment-method',
      reason: 'retrieve-customer-cards requires a per-customer token; no global list-all-payment-methods endpoint exists',
    },
    {
      resource: 'payout',
      reason: 'UPayments has no payout API; settlements are handled outside the REST API',
    },
    {
      resource: 'plan',
      reason: 'UPayments has no subscription plan management API',
    },
    {
      resource: 'subscription',
      reason: 'auto-deduct is a one-shot charge trigger, not a subscription management API with list/get/cancel',
    },
  ],
} as const
