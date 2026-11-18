export const metadata = {
  platform: 'fawry',
  totalResources: 10,
  availableResources: ['charge', 'refund'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'Fawry ECommerceWeb server API has no balance-transaction ledger endpoint; fee data is embedded on the charge response only.',
    },
    {
      resource: 'customer',
      reason:
        'Fawry has no standalone customer object or CRUD endpoints; customer contact details (name, email, mobile) are embedded on each charge.',
    },
    {
      resource: 'dispute',
      reason:
        'Fawry ECommerceWeb server API does not expose dispute/chargeback endpoints; dispute handling is managed through the merchant dashboard only.',
    },
    {
      resource: 'invoice',
      reason:
        'The Pay By Link e-invoice API is a separate Fawry product with a different auth scheme (username/password JWT), incompatible with this adapter\'s merchantCode + secureKey credential model.',
    },
    {
      resource: 'payment-method',
      reason:
        'Fawry ECommerceWeb server API does not expose standalone payment-method (card token) CRUD endpoints; payment method is a field on the charge request.',
    },
    {
      resource: 'payout',
      reason:
        'Fawry ECommerceWeb server API has no payout/settlement endpoints; merchant settlement is handled out-of-band by Fawry.',
    },
    {
      resource: 'plan',
      reason:
        'Fawry ECommerceWeb server API has no plan/price/product catalogue endpoints; there is no recurring billing plan concept in the server API.',
    },
    {
      resource: 'subscription',
      reason:
        'Fawry ECommerceWeb server API has no subscription management endpoints; recurring payments are handled via bank installment options at charge creation, not as subscription objects.',
    },
  ],
} as const
