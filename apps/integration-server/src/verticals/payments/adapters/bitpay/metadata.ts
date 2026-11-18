export const metadata = {
  platform: 'bitpay',
  totalResources: 10,
  availableResources: ['charge', 'refund'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'BitPay ledger entries (GET /ledgers/{currency}) require the merchant facade token, which is distinct from the POS facade token this adapter exposes; no balance-transaction API is accessible via the POS facade.',
    },
    {
      resource: 'customer',
      reason:
        'BitPay has no customer management API; it is a cryptocurrency checkout gateway with no persistent customer objects.',
    },
    {
      resource: 'dispute',
      reason:
        'BitPay does not expose a disputes API; chargebacks and disputes are handled outside the REST API via support tickets.',
    },
    {
      resource: 'invoice',
      reason:
        'BitPay has no billing-invoice resource; its "invoice" is a crypto-checkout charge mapped to the canonical Charge, not an AR billing document.',
    },
    {
      resource: 'payment-method',
      reason:
        'BitPay accepts cryptocurrency payments only and has no stored payment-method API.',
    },
    {
      resource: 'payout',
      reason:
        'BitPay payouts (GET /payouts) require the payout facade token, which is separate from the POS facade token this adapter exposes.',
    },
    {
      resource: 'plan',
      reason:
        'BitPay has no subscription plan, price, or product catalog API.',
    },
    {
      resource: 'subscription',
      reason:
        'BitPay has no subscription API; recurring billing is handled via custom integrations external to the REST API.',
    },
  ],
} as const
