export const metadata = {
  platform: 'geidea',
  totalResources: 10,
  availableResources: ['charge', 'refund', 'invoice', 'subscription'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason: 'No balance/ledger transaction API in the Geidea Direct API; settlement data is available only via the merchant portal.',
    },
    {
      resource: 'customer',
      reason: 'Customer data is embedded in orders; Geidea has no first-class listable customer resource in the Direct API.',
    },
    {
      resource: 'dispute',
      reason: 'Chargeback/dispute handling is managed internally by Geidea; no dispute API endpoint is exposed to merchants.',
    },
    {
      resource: 'payment-method',
      reason: 'Only card tokenization (save-card) is supported; there is no listable payment-method resource in the Direct API.',
    },
    {
      resource: 'payout',
      reason: 'Settlement payouts are pushed automatically to the merchant bank account; no payout API endpoint exists.',
    },
    {
      resource: 'plan',
      reason: 'No plan/product/price catalog API; subscription billing is configured with inline cycle parameters at creation time.',
    },
  ],
} as const
