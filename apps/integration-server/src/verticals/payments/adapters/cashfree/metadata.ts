export const metadata = {
  platform: 'cashfree',
  totalResources: 10,
  availableResources: [
    'charge',
    'refund',
    'customer',
    'dispute',
    'payment-method',
    'plan',
    'subscription',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'Cashfree PG has no balance-transaction ledger resource. Settlement reconciliation (POST /settlement/recon) returns aggregate settlement batches, not per-event ledger entries.',
    },
    {
      resource: 'invoice',
      reason:
        'Cashfree PG has no invoice resource. Billing is order-based; there is no /invoices endpoint.',
    },
    {
      resource: 'payout',
      reason:
        'Cashfree Payouts is a separate product (payout-api.cashfree.com) with its own authentication and SDK. It is not part of the PG API this adapter targets.',
    },
  ],
} as const
