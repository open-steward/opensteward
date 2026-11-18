export const metadata = {
  platform: 'gr4vy',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'payment-method',
    'refund',
    'payout',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'Gr4vy has no ledger balance-transaction concept; settlement data is a per-transaction sub-resource (/transactions/{id}/settlements) without net/fee/sourceType fields',
    },
    {
      resource: 'dispute',
      reason:
        'Gr4vy chargebacks are a financial settlement sub-resource scoped to individual transactions (/transactions/{id}/chargebacks); no top-level disputes endpoint and chargeback objects lack status, reason, and evidenceDueBy fields',
    },
    {
      resource: 'invoice',
      reason:
        'Gr4vy is a payment-orchestration layer with no invoice concept; no /invoices endpoint exists in the API',
    },
    {
      resource: 'plan',
      reason:
        'Gr4vy has no subscription plan or price concept; no /plans endpoint exists in the API',
    },
    {
      resource: 'subscription',
      reason:
        'Gr4vy has no subscription billing concept; no /subscriptions endpoint exists in the API',
    },
  ],
} as const
