export const metadata = {
  platform: 'trolley',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'invoice',
    'payout',
    'refund',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'Trolley /v1/balances returns a current account balance snapshot, not a historical transaction ledger',
    },
    {
      resource: 'dispute',
      reason:
        'Trolley is a mass-payout platform with no dispute or chargeback concept',
    },
    {
      resource: 'payment-method',
      reason:
        'Recipient payment methods are nested under /v1/recipients/{id}/accounts with no flat list endpoint; not mappable via the standard listPaymentMethods signature',
    },
    {
      resource: 'plan',
      reason: 'Trolley has no subscription billing or plan objects',
    },
    {
      resource: 'subscription',
      reason: 'Trolley has no subscription concept',
    },
  ],
} as const
