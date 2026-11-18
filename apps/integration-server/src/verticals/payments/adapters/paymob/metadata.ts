export const metadata = {
  platform: 'paymob',
  totalResources: 10,
  availableResources: ['charge', 'refund'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason: 'Paymob Accept API has no balance-transaction ledger endpoint; settlement reporting is not exposed via the Accept merchant key.',
    },
    {
      resource: 'customer',
      reason: 'Paymob has no standalone customer object; billing contact details are embedded on the order\'s billing_data field, not a separately addressable resource.',
    },
    {
      resource: 'dispute',
      reason: 'Paymob sends dispute-related webhook events but provides no REST query endpoint to list or retrieve dispute objects via the Accept API.',
    },
    {
      resource: 'invoice',
      reason: 'Paymob Accept API does not model invoices; there is no invoice resource or endpoint in the Accept (Intention) API.',
    },
    {
      resource: 'payment-method',
      reason: 'Card tokens are stored per-subscription (GET /api/acceptance/subscriptions/{id}/card-tokens) and are not addressable as standalone payment methods; the adapter\'s Secret Key auth also differs from the Management API auth required for that endpoint.',
    },
    {
      resource: 'payout',
      reason: 'Payouts are a separate Paymob product (payouts.paymobsolutions.com) with its own OAuth flow, not part of the Accept API.',
    },
    {
      resource: 'plan',
      reason: 'Subscription plan endpoints (/api/acceptance/subscription-plans) require the legacy API-Key→Bearer-Token auth flow (POST /api/auth/tokens), not the Secret Key Token auth used by this adapter; the resource cannot be synced via the current credential model.',
    },
    {
      resource: 'subscription',
      reason: 'Subscription endpoints (/api/acceptance/subscriptions/{id}) require the legacy API-Key→Bearer-Token auth flow (POST /api/auth/tokens), not the Secret Key Token auth used by this adapter; the resource cannot be synced via the current credential model.',
    },
  ],
} as const
