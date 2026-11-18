export const metadata = {
  platform: 'chargebee',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'invoice',
    'payment-method',
    'plan',
    'refund',
    'subscription',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'Chargebee is a billing-orchestration layer, not a payment gateway; fund settlement ledger entries (balance transactions) live in the underlying gateway (Stripe, Adyen, etc.) and are not exposed via the Chargebee API. Confirmed absent from the official OpenAPI spec (github.com/chargebee/openapi).',
    },
    {
      resource: 'dispute',
      reason:
        'Chargebee has no /disputes REST endpoint. Chargeback handling is UI-only (Chargebee Pay portal); the term "chargeback" appears only as a payment_method enum value on credit-note and transaction objects, not as a listable/retrievable resource. Confirmed absent from the official OpenAPI spec.',
    },
    {
      resource: 'payout',
      reason:
        'Chargebee has no /payouts REST endpoint. Payouts are settled by the underlying payment gateway (Stripe, Adyen, etc.) and only viewable in the Chargebee Pay portal UI or as downloadable reports; no programmatic API exists. Confirmed absent from the official OpenAPI spec.',
    },
  ],
} as const
