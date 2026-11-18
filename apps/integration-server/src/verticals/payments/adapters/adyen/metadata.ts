export const metadata = {
  platform: 'adyen',
  totalResources: 10,
  availableResources: [
    'balance-transaction',
    'charge',
    'customer',
    'dispute',
    'payment-method',
    'payout',
    'refund',
    'subscription',
  ],
  unavailableResources: [
    {
      resource: 'invoice',
      reason:
        'Adyen has no invoice API. It is a payment-processing platform; invoicing is handled externally. Confirmed via Checkout v71, Recurring v68, and Transfers v4 API Explorer — none expose invoice endpoints.',
    },
    {
      resource: 'plan',
      reason:
        'Adyen has no subscription plan or pricing-plan API. Recurring contracts are tokenised stored-payment-method records, not named billing plans. Confirmed via Recurring v68 API Explorer — no plan, price, or product endpoints exist.',
    },
  ],
} as const
