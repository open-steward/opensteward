export const metadata = {
  platform: 'ixopay',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'refund',
    'payment-method',
    'payout',
    'subscription',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason: 'IXOPAY v3 has no balance or ledger reporting API; it is a transaction-routing gateway with no settlement/balance endpoints.',
    },
    {
      resource: 'dispute',
      reason: 'Dispute action endpoints exist (accept/upload-evidence/submit-evidence) but there is no query, list, or get dispute API; dispute data is delivered only via push/webhook notifications.',
    },
    {
      resource: 'invoice',
      reason: 'IXOPAY is a payment-orchestration gateway with no invoice concept or billing management API.',
    },
    {
      resource: 'plan',
      reason: 'IXOPAY has no plan, product, or price catalog; recurring billing is handled via the schedule API with per-schedule amount/currency/period parameters.',
    },
  ],
} as const
