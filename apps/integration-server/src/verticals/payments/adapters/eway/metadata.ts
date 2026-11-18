export const metadata = {
  platform: 'eway',
  totalResources: 10,
  availableResources: ['charge', 'customer', 'refund'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'eWAY Rapid API exposes no settlement ledger or balance-transaction endpoint; fund reconciliation is handled outside the API.',
    },
    {
      resource: 'dispute',
      reason:
        'eWAY Rapid API has no dispute/chargeback management endpoints; disputes are handled by eWAY support offline.',
    },
    {
      resource: 'invoice',
      reason:
        'eWAY Rapid API has no Invoice object or endpoints; InvoiceReference is only a metadata field on transactions.',
    },
    {
      resource: 'payment-method',
      reason:
        'eWAY uses TokenCustomer for stored cards but provides no list/get/detach endpoint for saved payment methods; card details are only accessible via getCustomer.',
    },
    {
      resource: 'payout',
      reason:
        'eWAY Rapid API has no payout or settlement disbursement endpoints.',
    },
    {
      resource: 'plan',
      reason:
        'eWAY Rapid API has no subscription plan, price, or product endpoints; recurring billing is merchant-driven via TokenPayment.',
    },
    {
      resource: 'subscription',
      reason:
        'eWAY Rapid API has no subscription management; recurring payments are executed ad-hoc by the merchant calling TokenPayment on a schedule.',
    },
  ],
} as const
