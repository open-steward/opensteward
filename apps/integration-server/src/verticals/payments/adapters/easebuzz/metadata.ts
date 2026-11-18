export const metadata = {
  platform: 'easebuzz',
  totalResources: 10,
  availableResources: ['charge', 'refund'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'Easebuzz has no balance/ledger transaction resource; settlements are queried via a date-keyed payout API returning aggregate data, not itemized ledger entries.',
    },
    {
      resource: 'customer',
      reason:
        'Easebuzz has no customer object or customer API; customer details (name, email, phone) are embedded directly in each transaction.',
    },
    {
      resource: 'dispute',
      reason:
        'UNVERIFIED: Easebuzz has a Dispute Resolution System (DRS) documented at docs.easebuzz.in/docs/dispute-resolution-system/, but the docs pages returned only headings — no server-to-server endpoint paths or response field names could be confirmed.',
    },
    {
      resource: 'invoice',
      reason:
        'Easebuzz has no invoice resource in its server-to-server API; invoicing is a hosted/UI product (EasyCollect), not a queryable REST resource.',
    },
    {
      resource: 'payment-method',
      reason:
        'Easebuzz has no payment method vault or storage API; card/UPI/wallet details appear only as metadata fields on individual transactions.',
    },
    {
      resource: 'payout',
      reason:
        'UNVERIFIED: A payout API is confirmed to exist (docs.easebuzz.in/docs/payment-gateway/5a8fa194122c7-payout-api), but the docs page returned only a heading — no endpoint path or response field names could be confirmed.',
    },
    {
      resource: 'plan',
      reason:
        'Easebuzz has no plan/price/product catalog API; subscription billing is a hosted product (Recurri) with no server-to-server plan CRUD.',
    },
    {
      resource: 'subscription',
      reason:
        'Easebuzz has no subscription management API; recurring payments are handled via the hosted Recurri/AutoCollect product with no server-to-server subscription resource.',
    },
  ],
} as const
