export const metadata = {
  platform: 'pawapay',
  totalResources: 10,
  availableResources: ['charge', 'customer', 'payout', 'refund'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'pawaPay exposes only a current-balance snapshot (/wallets/balances), not a historical transaction ledger; individual balance-transaction records cannot be derived from this endpoint.',
    },
    {
      resource: 'dispute',
      reason:
        'pawaPay processes mobile-money payments which have no chargeback or dispute mechanism; no dispute endpoint exists.',
    },
    {
      resource: 'invoice',
      reason: 'pawaPay has no invoicing system; the API covers only deposits, disbursements, and refunds.',
    },
    {
      resource: 'payment-method',
      reason:
        'pawaPay is a mobile-money push/pull API; payments are routed by phone number (MSISDN) and there are no stored payment-method objects.',
    },
    {
      resource: 'plan',
      reason: 'pawaPay has no subscription billing catalogue; plans, prices, and products are not supported.',
    },
    {
      resource: 'subscription',
      reason: 'pawaPay has no subscription management; recurring billing is not a platform concept.',
    },
  ],
} as const
