export const metadata = {
  platform: 'nearpay',
  totalResources: 10,
  availableResources: ['charge', 'customer', 'refund'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'NearPay is a SoftPOS/Tap-to-Pay SDK platform; it has no balance-transaction ledger API.',
    },
    {
      resource: 'dispute',
      reason:
        'NearPay has no dispute management API; chargebacks are handled by the acquiring bank outside the NearPay platform.',
    },
    {
      resource: 'invoice',
      reason:
        'NearPay has no invoicing API; the platform is limited to in-person POS transactions.',
    },
    {
      resource: 'payment-method',
      reason:
        'NearPay does not expose stored payment-method objects; card data is handled transiently via NFC tap at the terminal.',
    },
    {
      resource: 'payout',
      reason:
        'NearPay has no payout API; settlement is managed by the merchant\'s acquiring bank, not the NearPay platform.',
    },
    {
      resource: 'plan',
      reason:
        'NearPay has no subscription billing catalog (plans/prices/products); it is a POS payment infrastructure product, not a billing gateway.',
    },
    {
      resource: 'subscription',
      reason:
        'NearPay has no subscription API; the platform supports only one-time in-person POS payments.',
    },
  ],
} as const
