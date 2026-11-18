export const metadata = {
  platform: 'circle',
  totalResources: 10,
  availableResources: [
    'charge',
    'payout',
    'refund',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason: 'Circle Mint has no individual ledger-entry API; only aggregate wallet balances are exposed via GET /v1/businessAccount/balances.',
    },
    {
      resource: 'customer',
      reason: 'Circle Mint is a B2B institutional stablecoin platform with no customer management concept.',
    },
    {
      resource: 'dispute',
      reason: 'Circle removed card payments (Cards API removed April 2025), so card chargebacks/disputes are not supported.',
    },
    {
      resource: 'invoice',
      reason: 'Circle Mint has no invoice or billing concept; it is a stablecoin mint/redeem and payment platform.',
    },
    {
      resource: 'payment-method',
      reason: 'Circle removed the Cards API in April 2025; there is no stored payment-method management endpoint.',
    },
    {
      resource: 'plan',
      reason: 'Circle Mint has no subscription billing or plan concept.',
    },
    {
      resource: 'subscription',
      reason: 'Circle Mint has no subscription or recurring billing concept.',
    },
  ],
} as const
