export const metadata = {
  platform: 'atome',
  totalResources: 10,
  availableResources: ['charge', 'refund'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'Atome v2 is payment-centric (BNPL); no balance-transaction or settlement ledger endpoint exists.',
    },
    {
      resource: 'customer',
      reason:
        'Atome does not model customers as first-class REST resources; consumer contact info is passed inline at payment creation and is not queryable.',
    },
    {
      resource: 'dispute',
      reason: 'Atome v2 has no dispute or chargeback API endpoint.',
    },
    {
      resource: 'invoice',
      reason: 'Atome v2 has no invoice API endpoint.',
    },
    {
      resource: 'payment-method',
      reason:
        'Atome does not expose stored payment methods as API resources; instalment plans are managed inside the Atome consumer app.',
    },
    {
      resource: 'payout',
      reason: 'Atome v2 has no payout or settlement disbursement API endpoint.',
    },
    {
      resource: 'plan',
      reason:
        'Atome v2 has no plan, price, or product API endpoint; instalment tenors are fixed per market.',
    },
    {
      resource: 'subscription',
      reason: 'Atome v2 has no subscription or recurring-billing API endpoint.',
    },
  ],
} as const
