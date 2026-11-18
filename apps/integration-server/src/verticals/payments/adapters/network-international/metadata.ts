export const metadata = {
  platform: 'network-international',
  totalResources: 10,
  availableResources: ['charge', 'refund'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'N-Genius has no balance-ledger or settlement-reporting API; the platform is order-centric with no balance transaction concept.',
    },
    {
      resource: 'customer',
      reason:
        'N-Genius has no customer management concept or endpoint; orders are addressed by outlet-scoped references, not customer records.',
    },
    {
      resource: 'dispute',
      reason:
        'N-Genius has no dispute or chargeback API; chargebacks are handled offline through the merchant portal.',
    },
    {
      resource: 'invoice',
      reason:
        'N-Genius "invoice" is a Pay-by-Link generator (POST /invoices/.../invoice); it produces a payment link, not a retrievable billing-invoice record — there is no list or get-by-ID endpoint.',
    },
    {
      resource: 'payment-method',
      reason:
        'N-Genius card tokens are embedded in order response payloads; there is no standalone payment-method list or fetch API.',
    },
    {
      resource: 'payout',
      reason:
        'UNVERIFIED: A separate N-Genius Payout API product exists; however its endpoint paths are only available via a merchant-credentialed Postman collection and are not publicly documented.',
    },
    {
      resource: 'plan',
      reason:
        'N-Genius has no subscription plan or pricing model API; recurring payment intervals are configured in the merchant portal.',
    },
    {
      resource: 'subscription',
      reason:
        'N-Genius has no subscription management API; recurring payments are created per-order via the portal, not via a programmable subscription object.',
    },
  ],
} as const
