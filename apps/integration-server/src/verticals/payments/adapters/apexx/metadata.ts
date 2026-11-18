export const metadata = {
  platform: 'apexx',
  totalResources: 10,
  availableResources: ['charge', 'refund'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'APEXX is a payment-routing layer with no balance or ledger API; there is no endpoint for balance transactions.',
    },
    {
      resource: 'customer',
      reason:
        'APEXX has no discrete customer resource; a customer_id and billing address are embedded inline on each transaction.',
    },
    {
      resource: 'dispute',
      reason:
        'APEXX does not expose chargeback/dispute data via REST API; chargebacks arrive only through reconciliation files and webhook notifications.',
    },
    {
      resource: 'invoice',
      reason:
        'APEXX is a payment-routing orchestrator and has no invoicing or billing engine; no invoice endpoints exist.',
    },
    {
      resource: 'payment-method',
      reason:
        'UNVERIFIED: APEXX supports card tokenisation but the full API documentation (Swagger UI at sandbox.apexx.global) was not publicly accessible to confirm a token-listing REST endpoint.',
    },
    {
      resource: 'payout',
      reason:
        'APEXX OCT/payout transactions are submitted via Virtual Terminal UI; no list or get REST endpoint for payouts is documented in the public API.',
    },
    {
      resource: 'plan',
      reason:
        'APEXX is a payment-routing layer and has no subscription billing engine; no plan, price, or product endpoints exist.',
    },
    {
      resource: 'subscription',
      reason:
        'APEXX is a payment-routing layer and has no subscription billing engine; no subscription endpoints exist.',
    },
  ],
} as const
