export const metadata = {
  platform: 'openpay',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'payment-method',
    'payout',
    'plan',
    'refund',
    'subscription',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason: 'Openpay has no balance/ledger endpoint; not present in any official SDK or documentation',
    },
    {
      resource: 'dispute',
      reason: 'Openpay has no chargebacks REST resource; chargebacks appear only as inbound webhook events (chargeback.accepted), with no list/get endpoint',
    },
    {
      resource: 'invoice',
      reason: 'Openpay has no invoice concept or endpoint; not present in any official SDK or documentation',
    },
  ],
} as const
