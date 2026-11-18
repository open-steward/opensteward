export const metadata = {
  platform: 'salt-edge',
  totalResources: 10,
  availableResources: ['charge', 'customer'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'Salt Edge is an Account Information / Payment Initiation Service (AIS/PIS); it has no concept of gateway balance transactions.',
    },
    {
      resource: 'dispute',
      reason:
        'Salt Edge does not process card payments and has no dispute management API.',
    },
    {
      resource: 'invoice',
      reason:
        'Salt Edge is not a billing platform; it has no invoicing concept.',
    },
    {
      resource: 'payment-method',
      reason:
        'Salt Edge does not store card or bank-account payment methods on behalf of merchants.',
    },
    {
      resource: 'payout',
      reason:
        'Salt Edge has no payout / disbursement API; it only initiates account-to-account payments.',
    },
    {
      resource: 'plan',
      reason:
        'Salt Edge has no subscription billing catalog (plans, prices, products).',
    },
    {
      resource: 'refund',
      reason:
        'Salt Edge does not process card payments and therefore has no refund API.',
    },
    {
      resource: 'subscription',
      reason:
        'Salt Edge has no subscription management API; VRP consents are not equivalent to merchant subscriptions.',
    },
  ],
} as const
