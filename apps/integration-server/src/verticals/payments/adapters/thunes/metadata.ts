export const metadata = {
  platform: 'thunes',
  totalResources: 10,
  availableResources: [
    'balance-transaction',
    'charge',
    'customer',
    'refund',
  ],
  unavailableResources: [
    {
      resource: 'dispute',
      reason: 'Thunes has no dispute/chargeback API in either Money Transfer v2 or Accept v1',
    },
    {
      resource: 'invoice',
      reason: 'Thunes has no invoice concept; billing is handled externally to the platform',
    },
    {
      resource: 'payment-method',
      reason: 'Thunes does not expose stored payment methods as a first-class API resource',
    },
    {
      resource: 'payout',
      reason: 'Accept API payout-requests endpoint has no list operation and uses a separate undisclosed base URL',
    },
    {
      resource: 'plan',
      reason: 'Thunes has no subscription billing or plan/price catalog concept',
    },
    {
      resource: 'subscription',
      reason: 'Thunes has no subscription concept; it is a transaction-based remittance platform',
    },
  ],
} as const
