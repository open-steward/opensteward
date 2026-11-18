export const metadata = {
  platform: 'payabli',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'refund',
    'dispute',
    'invoice',
    'subscription',
  ],
  unavailableResources: [
    {
      resource: 'payment-method',
      reason:
        'UNVERIFIED: TokenStorage POST/PUT/DELETE confirmed; no GET list or GET-by-id endpoint with confirmed response fields found in public docs',
    },
    {
      resource: 'payout',
      reason:
        "UNVERIFIED: Payabli's payout concept is B2B money-out to vendors (PayoutSubscription/MoneyOut API), not merchant bank settlement; no endpoint cleanly maps to the canonical Payout resource",
    },
    {
      resource: 'plan',
      reason:
        'Payabli subscriptions embed amount/frequency directly; no Plan/Price/Product catalog entity exists in the API',
    },
    {
      resource: 'balance-transaction',
      reason:
        'No per-transaction balance record endpoint; settlement data is at batch level only (GET /api/Query/batches/org/{orgId}) and does not map to per-transaction balance entries',
    },
  ],
} as const
