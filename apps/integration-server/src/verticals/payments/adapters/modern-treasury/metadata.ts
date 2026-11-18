export const metadata = {
  platform: 'modern-treasury',
  totalResources: 10,
  availableResources: [
    'balance-transaction',
    'charge',
    'customer',
    'invoice',
    'payment-method',
    'refund',
  ],
  unavailableResources: [
    {
      resource: 'dispute',
      reason: 'Modern Treasury has no dispute/chargeback concept; it is a treasury and payment-ops platform, not a card-payment gateway',
    },
    {
      resource: 'payout',
      reason: 'No dedicated payout resource; outbound fund transfers are modeled as payment orders, not a separate payout object',
    },
    {
      resource: 'plan',
      reason: 'No subscription billing or plan concept; Modern Treasury is a payment-ops/treasury platform without recurring billing',
    },
    {
      resource: 'subscription',
      reason: 'No subscription concept; Modern Treasury is a payment-ops/treasury platform without recurring billing',
    },
  ],
} as const
