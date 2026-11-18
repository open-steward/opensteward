export const metadata = {
  platform: 'amazon-pay',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'refund',
    'dispute',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'Amazon Pay exposes settlement data only via async flat-file Reports API, not a per-transaction balance-transaction REST resource.',
    },
    {
      resource: 'invoice',
      reason:
        'Amazon Pay has no invoice object; billing is driven by Charge Permissions and Charges only.',
    },
    {
      resource: 'payment-method',
      reason:
        'Stored payment methods are held inside the Amazon Pay wallet; API v2 exposes no retrievable PaymentMethod resource.',
    },
    {
      resource: 'payout',
      reason:
        'Settlement disbursements are available only via flat-file Settlement Reports, not a dedicated payout REST endpoint.',
    },
    {
      resource: 'plan',
      reason:
        'Amazon Pay has no plan/price/product catalog; recurring billing is modelled as Charge Permissions.',
    },
    {
      resource: 'subscription',
      reason:
        'Amazon Pay models recurring consent as Charge Permissions, not a distinct subscription object with billing intervals.',
    },
  ],
} as const
