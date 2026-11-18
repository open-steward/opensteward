export const metadata = {
  platform: 'checkout-com',
  totalResources: 10,
  availableResources: [
    'balance-transaction',
    'charge',
    'customer',
    'dispute',
    'payment-method',
    'payout',
    'refund',
  ],
  unavailableResources: [
    {
      resource: 'invoice',
      reason:
        'Checkout.com has no native invoice API; invoicing is handled externally or via third-party platforms.',
    },
    {
      resource: 'plan',
      reason:
        'Checkout.com has no native billing plan API; subscription plans are managed by the merchant externally.',
    },
    {
      resource: 'subscription',
      reason:
        'Checkout.com has no native subscription management API; recurring payments are implemented by merchants using stored card credentials against the payments endpoint.',
    },
  ],
} as const
