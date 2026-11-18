export const metadata = {
  platform: 'cellulant',
  totalResources: 10,
  availableResources: ['charge', 'refund'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'Tingg checkout API has no balance-transaction ledger endpoint; only per-request status queries are available.',
    },
    {
      resource: 'customer',
      reason:
        'Tingg has no customer management resource; payers are identified inline per request via account_number/msisdn.',
    },
    {
      resource: 'dispute',
      reason: 'Tingg checkout API exposes no dispute or chargeback endpoints.',
    },
    {
      resource: 'invoice',
      reason:
        'The "Create Bill" endpoint lives on a separate paybylink-apis host and is not part of the checkout-api used by this adapter; no list/get invoice endpoints are documented.',
    },
    {
      resource: 'payment-method',
      reason:
        'Tingg has no tokenised payment-method (card/wallet) management API; payment channel is selected at checkout time.',
    },
    {
      resource: 'payout',
      reason:
        'Tingg Payouts is a separate product on a different API (v1/global-api/payments) with its own credentials; it is not part of the checkout-api integrated here.',
    },
    {
      resource: 'plan',
      reason: 'Tingg has no plan, price, or product catalogue API.',
    },
    {
      resource: 'subscription',
      reason: 'Tingg has no recurring-subscription API.',
    },
  ],
} as const
