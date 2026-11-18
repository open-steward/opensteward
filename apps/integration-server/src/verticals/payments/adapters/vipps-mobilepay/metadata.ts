export const metadata = {
  platform: 'vipps-mobilepay',
  totalResources: 10,
  availableResources: ['charge', 'refund', 'subscription'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'No discrete balance-transaction object in the ePayment API; settlement ledger entries live in the separate Report API which requires its own ledger discovery flow',
    },
    {
      resource: 'customer',
      reason:
        'No customer management API; the only user identifier is the pseudonymous sub claim on payment and agreement objects',
    },
    {
      resource: 'dispute',
      reason:
        'No disputes or chargebacks API; chargeback ledger entries surface only in the separate Report API',
    },
    {
      resource: 'invoice',
      reason: 'No invoice API',
    },
    {
      resource: 'payment-method',
      reason:
        'No stored payment-method management API; payment method is always WALLET with no CRUD surface',
    },
    {
      resource: 'payout',
      reason:
        'No discrete payout object; bank transfer settlements are ledger entries in the Report API only',
    },
    {
      resource: 'plan',
      reason:
        'No plan or price catalog API; the Recurring API embeds pricing directly in each agreement with no separate plan entity',
    },
  ],
} as const
