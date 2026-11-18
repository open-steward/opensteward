export const metadata = {
  platform: 'paytm',
  totalResources: 10,
  availableResources: ['charge', 'refund'],
  unavailableResources: [
    {
      resource: 'customer',
      reason:
        'Paytm has no standalone Customer API; custId is a merchant-assigned opaque string with no list or get endpoint.',
    },
    {
      resource: 'invoice',
      reason:
        'Paytm has no invoice concept; merchants create payment links, not structured invoices with line items.',
    },
    {
      resource: 'plan',
      reason:
        'Paytm subscriptions are ad-hoc (amount/frequency passed per-order); there is no reusable plan catalog API.',
    },
    {
      resource: 'balance-transaction',
      reason:
        'UNVERIFIED: Settlement detail APIs (SettlementTransactionDetail) use JWT Bearer auth and are production-only — different auth model from the existing PG checksum client.',
    },
    {
      resource: 'payment-method',
      reason:
        'UNVERIFIED: Fetch Saved Cards API requires an SSO session token (different auth flow from the MID/Merchant-Key credential scheme used by this adapter).',
    },
    {
      resource: 'payout',
      reason:
        'UNVERIFIED: Settlement Summary/Detail APIs use JWT Bearer auth and are production-only — different auth model from the existing PG checksum client.',
    },
    {
      resource: 'dispute',
      reason:
        "Paytm's Dispute Status API (POST /v1/dispute/status) is get-by-id only: its body requires a disputeId, and the vendor documents no list or search endpoint and no pagination, so there is no way to enumerate a merchant's disputes. A disputeId reaches a merchant only through a chargeback webhook or the dashboard, neither of which this adapter consumes.",
    },
    {
      resource: 'subscription',
      reason:
        'UNVERIFIED: Subscription APIs (checkStatus, list/all) require an AES/SSO token — a different auth flow from the MID/Merchant-Key checksum scheme used by this adapter.',
    },
  ],
} as const
