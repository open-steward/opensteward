export const metadata = {
  platform: 'ipay88',
  totalResources: 10,
  availableResources: ['charge', 'customer', 'refund'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason: 'iPay88 is a redirect-based payment gateway; it exposes no balance/ledger API — only payment initiation and status requery endpoints.',
    },
    {
      resource: 'dispute',
      reason: 'iPay88 provides no dispute or chargeback management API; chargebacks are handled offline through the bank/acquirer.',
    },
    {
      resource: 'invoice',
      reason: 'iPay88 has no invoice resource or endpoint; it is a pure payment gateway with no billing/invoicing layer.',
    },
    {
      resource: 'payment-method',
      reason: 'iPay88 does not expose a payment-method management API; card/wallet details are handled transiently on the hosted payment page.',
    },
    {
      resource: 'payout',
      reason: 'iPay88 settlements are processed offline on a weekly schedule; no payout API endpoint exists.',
    },
    {
      resource: 'plan',
      reason: 'iPay88 has no subscription plan or pricing API; recurring billing is handled via per-transaction recurring-payment requests.',
    },
    {
      resource: 'subscription',
      reason: 'iPay88 recurring payments are initiated per-transaction via the Checkout endpoint, not managed as subscription objects through a subscription API.',
    },
  ],
} as const
