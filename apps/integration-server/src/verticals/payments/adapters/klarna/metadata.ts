export const metadata = {
  platform: 'klarna',
  totalResources: 10,
  availableResources: ['charge', 'refund', 'payout'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'No dedicated balance-transaction API; settlement transaction lines exist but do not map 1:1 to the canonical concept',
    },
    {
      resource: 'customer',
      reason:
        'No customer management API; Klarna has no endpoint to list or retrieve customer profiles',
    },
    {
      resource: 'dispute',
      reason:
        'UNVERIFIED: Dispute API v3 endpoints (GET /disputes, GET /disputes/{id}) are referenced in integration docs but exact base path and response field names could not be verified — API reference pages return 404',
    },
    {
      resource: 'invoice',
      reason:
        'Klarna issues consumer invoices internally as part of BNPL; no merchant-facing invoice management API exists',
    },
    {
      resource: 'payment-method',
      reason:
        'No list-payment-methods endpoint; individual customer token GET exists but requires a known token ID with no enumeration capability',
    },
    {
      resource: 'plan',
      reason:
        'No plan/product catalog API; Klarna has no subscription plan management endpoint',
    },
    {
      resource: 'subscription',
      reason:
        'Subscriptions are managed via customer tokens on the merchant side; no list/get subscription endpoint exists in the Klarna API',
    },
  ],
} as const
