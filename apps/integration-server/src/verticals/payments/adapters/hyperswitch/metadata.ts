export const metadata = {
  platform: 'hyperswitch',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'dispute',
    'payment-method',
    'payout',
    'refund',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason: 'Hyperswitch exposes no balance-transaction REST API; its internal reconciliation ledger is not publicly addressable.',
    },
    {
      resource: 'invoice',
      reason: 'Hyperswitch has no native invoices API; billing is delegated to third-party providers (Chargebee, Stripe Billing, etc.).',
    },
    {
      resource: 'plan',
      reason: 'Hyperswitch has no native plans API; plan management belongs to the connected subscription provider.',
    },
    {
      resource: 'subscription',
      reason: 'Hyperswitch acts as a payment orchestrator only; subscription lifecycle is owned by the merchant\'s subscription provider.',
    },
  ],
} as const
