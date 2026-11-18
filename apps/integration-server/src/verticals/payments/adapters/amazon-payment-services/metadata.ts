export const metadata = {
  platform: 'amazon-payment-services',
  totalResources: 10,
  availableResources: ['charge', 'refund'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'APS is a command-based gateway with no ledger or balance-transaction API; the Reporting API returns raw transaction rows only.',
    },
    {
      resource: 'customer',
      reason:
        'APS has no customer management resource; customer details are embedded per-transaction only.',
    },
    {
      resource: 'dispute',
      reason:
        'APS exposes no dispute or chargeback API; chargebacks are handled out-of-band via the merchant dashboard.',
    },
    {
      resource: 'invoice',
      reason:
        'APS has no invoice resource; the Payment Link feature is a UI construct with no programmatic invoice object.',
    },
    {
      resource: 'payment-method',
      reason:
        'APS has no payment-method listing or retrieval API; card tokens are created via the Tokenization command and referenced by token_name only.',
    },
    {
      resource: 'payout',
      reason:
        'APS has no payout or settlement disbursement API; payouts are managed entirely by the acquiring bank outside APS.',
    },
    {
      resource: 'plan',
      reason:
        'APS has no plan, price, or product resource; recurring billing is implemented by the merchant scheduling PURCHASE commands with eci=RECURRING.',
    },
    {
      resource: 'subscription',
      reason:
        'APS has no subscription management resource; recurring payments use a PURCHASE+eci=RECURRING command with merchant-managed scheduling.',
    },
  ],
} as const
