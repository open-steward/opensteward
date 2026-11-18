export const metadata = {
  platform: 'billie',
  totalResources: 10,
  availableResources: ['charge', 'invoice', 'refund'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'Billie has no ledger/balance-transaction API — its only resources are orders, invoices, and credit notes.',
    },
    {
      resource: 'customer',
      reason:
        'Billie has no customer/debtor management API; debtor details are embedded in the order payload only.',
    },
    {
      resource: 'dispute',
      reason: 'Billie does not expose a dispute or chargeback API; disputes are handled out-of-band.',
    },
    {
      resource: 'payment-method',
      reason:
        'Billie has no payment-method API; the selected payment method is a read-only field on an order.',
    },
    {
      resource: 'payout',
      reason:
        'Billie has no payout API; payouts are triggered automatically when an invoice is confirmed and are not addressable resources.',
    },
    {
      resource: 'plan',
      reason:
        'Billie is a transaction-level BNPL platform with no subscription or plan concept in its API.',
    },
    {
      resource: 'subscription',
      reason:
        'Billie is a transaction-level BNPL platform with no subscription concept in its API.',
    },
  ],
} as const
