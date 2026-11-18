export const metadata = {
  platform: 'doku',
  totalResources: 10,
  availableResources: ['charge', 'refund'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'DOKU has no balance-transaction ledger API; settlement data is available only as downloadable reports via the merchant dashboard, not a REST endpoint.',
    },
    {
      resource: 'customer',
      reason:
        'DOKU has no managed customer object; the merchant supplies a customer identifier at checkout time and DOKU does not persist or expose a customer resource.',
    },
    {
      resource: 'dispute',
      reason:
        'DOKU has no dispute/chargeback API; dispute management is handled offline through DOKU merchant support.',
    },
    {
      resource: 'invoice',
      reason:
        'DOKU has no invoice billing object; "invoice_number" is a merchant-assigned identifier on a charge, not a separate invoicing resource.',
    },
    {
      resource: 'payment-method',
      reason:
        'DOKU tokenizes cards internally but does not expose a listable or retrievable payment-method resource via its public API.',
    },
    {
      resource: 'payout',
      reason:
        'DOKU offers a separate Kirim DOKU payout product that requires distinct AGENTKEY credentials unrelated to the Jokul Checkout integration; it is not accessible through the standard merchant Client-Id/Secret-Key auth used by this adapter.',
    },
    {
      resource: 'plan',
      reason:
        'DOKU has no subscription billing plan concept; it is a transactional payment gateway with no recurring billing engine.',
    },
    {
      resource: 'subscription',
      reason:
        'DOKU has no subscription object; it is a transactional payment gateway with no recurring billing engine.',
    },
  ],
} as const
