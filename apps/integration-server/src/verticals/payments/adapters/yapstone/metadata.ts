export const metadata = {
  platform: 'yapstone',
  totalResources: 10,
  availableResources: ['charge', 'customer', 'refund'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'UNVERIFIED: Yapstone developer portal (developer.yapstone.com) returns 403 and Apiary docs are JavaScript-rendered; endpoint path and response shape could not be confirmed.',
    },
    {
      resource: 'dispute',
      reason:
        'UNVERIFIED: Yapstone advertises chargeback management but official API docs are inaccessible (403/JS-rendered); endpoint path and response shape could not be confirmed.',
    },
    {
      resource: 'invoice',
      reason:
        'UNVERIFIED: No invoice endpoint found in accessible Yapstone documentation; platform is focused on marketplace payments for property rentals, not invoice-based billing.',
    },
    {
      resource: 'payment-method',
      reason:
        'UNVERIFIED: Yapstone uses a hosted-elements iframe flow for card capture; no stored payment-method list/get endpoint confirmed in accessible docs.',
    },
    {
      resource: 'payout',
      reason:
        'UNVERIFIED: Yapstone advertises ACH payout API to onboarded sellers but official API docs are inaccessible (403/JS-rendered); endpoint path and response shape could not be confirmed.',
    },
    {
      resource: 'plan',
      reason:
        'UNVERIFIED: No plan/recurring-billing product endpoint found in accessible Yapstone documentation; platform is focused on marketplace payments, not subscription plan management.',
    },
    {
      resource: 'subscription',
      reason:
        'UNVERIFIED: No subscription endpoint found in accessible Yapstone documentation; platform is focused on one-time and split marketplace payments for property rentals.',
    },
  ],
} as const
