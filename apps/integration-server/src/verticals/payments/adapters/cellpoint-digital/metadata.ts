export const metadata = {
  platform: 'cellpoint-digital',
  totalResources: 10,
  availableResources: ['charge', 'refund'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'CellPoint Digital Velocity is a pure payment-orchestration layer; it has no ledger or balance-transaction concept — only per-transaction status via /mpoint/get-transaction-status.',
    },
    {
      resource: 'customer',
      reason:
        'The Velocity/mPoint API has no customer management endpoints; it is transaction-oriented and does not store or expose customer profiles.',
    },
    {
      resource: 'dispute',
      reason:
        'CellPoint Digital Velocity has no dispute or chargeback management API; disputes are handled externally by acquiring banks and PSPs.',
    },
    {
      resource: 'invoice',
      reason:
        'The Velocity/mPoint API has no invoicing concept; it is a payment-orchestration layer focused on transaction authorisation and capture.',
    },
    {
      resource: 'payment-method',
      reason:
        'CellPoint Digital does not expose a stored payment-method management API; card details are tokenised by the downstream PSP and not surfaced as a listable resource.',
    },
    {
      resource: 'payout',
      reason:
        'The Velocity/mPoint API has no payout or settlement disbursement endpoints; settlement is managed by the acquiring bank outside the platform.',
    },
    {
      resource: 'plan',
      reason:
        'CellPoint Digital Velocity has no subscription billing or plan/price/product catalogue; it does not offer recurring billing functionality.',
    },
    {
      resource: 'subscription',
      reason:
        'CellPoint Digital Velocity has no subscription management API; it is a single-transaction orchestration platform with no recurring billing support.',
    },
  ],
} as const
