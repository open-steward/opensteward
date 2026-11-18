export const metadata = {
  platform: 'fastspring',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'refund',
    'subscription',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'FastSpring is a merchant-of-record, not a card gateway; no ledger or balance-transaction API endpoint exists.',
    },
    {
      resource: 'dispute',
      reason:
        'Disputes (chargebacks) are handled through the FastSpring dashboard UI only; no REST API endpoint is exposed.',
    },
    {
      resource: 'invoice',
      reason:
        'UNVERIFIED: GET /invoices/{id} endpoint confirmed but no list-all-invoices endpoint is documented; listInvoices cannot be implemented.',
    },
    {
      resource: 'payment-method',
      reason:
        'FastSpring stores no vaulted payment methods; payment method data is per-checkout session only and not queryable via the REST API.',
    },
    {
      resource: 'payout',
      reason:
        'Payouts are managed through the FastSpring Payout Portal UI; no REST API endpoint for payouts is documented.',
    },
    {
      resource: 'plan',
      reason:
        'FastSpring has no dedicated plan or price object; billing configuration lives on Products and Subscriptions with no separate plan endpoint.',
    },
  ],
} as const
