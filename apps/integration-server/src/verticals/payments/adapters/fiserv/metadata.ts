export const metadata = {
  platform: 'fiserv',
  totalResources: 10,
  availableResources: ['charge', 'refund'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'Commerce Hub has no balance-transaction concept; it is transaction-centric (POST-only) with no ledger/balance reporting surface.',
    },
    {
      resource: 'customer',
      reason:
        'Commerce Hub has no customer vault or customer CRUD; payment sources are referenced by token or card data inline per transaction.',
    },
    {
      resource: 'dispute',
      reason:
        'Dispute management in Fiserv is handled by a separate product (Control Center / Exchange), not Commerce Hub; Commerce Hub exposes no dispute endpoints.',
    },
    {
      resource: 'invoice',
      reason:
        'Commerce Hub has no invoice concept; it is a pure payment-processing gateway with no billing/invoicing layer.',
    },
    {
      resource: 'payment-method',
      reason:
        'Commerce Hub has no standalone payment-method CRUD; tokenization is a POST-per-transaction operation with no list/get/detach surface.',
    },
    {
      resource: 'payout',
      reason:
        'Commerce Hub has no payout/settlement reporting API; settlement is handled out-of-band by Fiserv\'s back-office systems.',
    },
    {
      resource: 'plan',
      reason:
        'Commerce Hub has no plan/price/product concept; recurring schedules are on a separate Fiserv product (docs.fiserv.dev), not Commerce Hub.',
    },
    {
      resource: 'subscription',
      reason:
        'Commerce Hub has no subscription management; the /payment-schedules endpoint is on a separate Fiserv product, not the Commerce Hub payments/v1 API.',
    },
  ],
} as const
