export const metadata = {
  platform: '2c2p',
  totalResources: 10,
  availableResources: ['charge'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'Balance Inquiry returns merchant wallet balance (not a transaction ledger); uses JWS PS256 — a different auth channel from the HS256 api_key flow this adapter targets.',
    },
    {
      resource: 'customer',
      reason:
        'No standalone Customer API. Card tokenisation (customerToken) is an attribute on a transaction, not an independent resource.',
    },
    {
      resource: 'dispute',
      reason:
        'Chargebacks/disputes are handled manually by 2C2P operations staff notifying the merchant; no dispute API endpoint is published.',
    },
    {
      resource: 'invoice',
      reason:
        'No invoice resource. The Payment Instruction endpoint generates payment instructions for end-users, not merchant-level invoices.',
    },
    {
      resource: 'payment-method',
      reason:
        'Card Token Information API exists but requires JWE+JWS with RSA X.509 keys — a different auth channel from the HS256 api_key flow this adapter targets.',
    },
    {
      resource: 'payout',
      reason:
        'Payout Inquiry uses HS256 but is keyed by merchant-generated requestID / UTR with no list-all endpoint; not enumerable as a standard get/list resource.',
    },
    {
      resource: 'plan',
      reason:
        'No Plan/Price/Product management API. RPP (Recurring Payment Plan) parameters are embedded in the Payment Token request, not a standalone resource.',
    },
    {
      resource: 'refund',
      reason:
        'Refunds run through Payment Maintenance (JWE+JWS RSA channel with X.509 key pair), which is out of scope for the HS256 api_key flow this adapter targets.',
    },
    {
      resource: 'subscription',
      reason:
        'RPP (Recurring Payment Plan) maintenance supports single-record inquiry by recurringUniqueID only; no list-all endpoint, and uses JWE+JWS exchange key — a different auth channel.',
    },
  ],
} as const
