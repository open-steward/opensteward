export const metadata = {
  platform: 'yoco',
  totalResources: 10,
  availableResources: [
    'balance-transaction',
    'charge',
    'customer',
    'payout',
    'refund',
  ],
  unavailableResources: [
    { resource: 'dispute', reason: 'Yoco API has no disputes endpoint' },
    { resource: 'invoice', reason: 'Yoco API has no invoices endpoint' },
    { resource: 'payment-method', reason: 'Yoco API has no payment-methods endpoint' },
    { resource: 'plan', reason: 'Yoco API has no plans or subscription-billing endpoints' },
    { resource: 'subscription', reason: 'Yoco API has no subscription-billing endpoint; only webhook subscriptions exist' },
  ],
} as const
