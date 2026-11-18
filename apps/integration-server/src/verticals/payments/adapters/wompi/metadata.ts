export const metadata = {
  platform: 'wompi',
  totalResources: 10,
  availableResources: ['charge', 'customer', 'refund'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'Wompi has no per-transaction ledger endpoint; the payouts API exposes account-level balances only via GET /accounts on a separate base URL.',
    },
    {
      resource: 'dispute',
      reason: 'Wompi does not expose a disputes or chargebacks endpoint in its public API.',
    },
    {
      resource: 'invoice',
      reason: 'Wompi has no invoice concept or endpoint in its public API.',
    },
    {
      resource: 'payment-method',
      reason:
        'Wompi provides POST /v1/payment_sources (create) and PUT /v1/payment_sources/{id}/void (cancel) but no GET list or read endpoint for payment sources.',
    },
    {
      resource: 'payout',
      reason:
        'UNVERIFIED: Wompi payouts run on a separate base URL (api.payouts.wompi.co/v1) with separate authentication and map to bulk disbursement batches rather than individual merchant payouts; wiring into this adapter was not confirmed.',
    },
    {
      resource: 'plan',
      reason:
        'Wompi "plans" are merchant pricing tiers on the Wompi website, not API-accessible objects; no /plans endpoint exists.',
    },
    {
      resource: 'subscription',
      reason:
        'Wompi recurring payments are implemented via tokenised payment sources (Bancolombia/Nequi/Daviplata); there is no subscription object or /subscriptions endpoint in the API.',
    },
  ],
} as const
