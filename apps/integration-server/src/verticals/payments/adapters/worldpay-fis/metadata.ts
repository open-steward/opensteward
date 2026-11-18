export const metadata = {
  platform: 'worldpay-fis',
  totalResources: 10,
  availableResources: [
    'balance-transaction',
    'charge',
    'payment-method',
    'payout',
    'refund',
  ],
  unavailableResources: [
    {
      resource: 'customer',
      reason: 'No customer profile endpoint in the Worldpay Access API; identity is carried by the token namespace only',
    },
    {
      resource: 'dispute',
      reason: 'UNVERIFIED: A separate Disputes Direct API product exists but requires distinct onboarding; endpoint path and auth scheme could not be confirmed from public docs',
    },
    {
      resource: 'invoice',
      reason: 'Gateway-level API only; no invoice entity exists in the Worldpay Access API',
    },
    {
      resource: 'plan',
      reason: 'No plan resource; recurring payments use a payment-level customerAgreement with no stand-alone plan entity',
    },
    {
      resource: 'subscription',
      reason: 'No subscription management resource; recurring MIT payments are tracked at the individual payment level without a subscription record',
    },
  ],
} as const
