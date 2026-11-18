export const metadata = {
  platform: 'plaid',
  totalResources: 10,
  availableResources: ['charge', 'payout', 'refund'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'Plaid Transfer product has no merchant-ledger layer; there is no balance-transaction concept.',
    },
    {
      resource: 'customer',
      reason:
        'Plaid Transfer product has no stored-customer vault; end-user identity lives on an Item/access_token, not a customer record.',
    },
    {
      resource: 'dispute',
      reason:
        'Plaid ACH/RTP transfers have returns (mapped to refunded status on Charge) but no card-style chargeback/dispute object.',
    },
    {
      resource: 'invoice',
      reason:
        'Plaid Transfer product has no invoicing or recurring-billing layer.',
    },
    {
      resource: 'payment-method',
      reason:
        'Plaid Transfer product has no card-vault or stored payment-method object; bank accounts are linked via Item/access_token.',
    },
    {
      resource: 'plan',
      reason:
        'Plaid Transfer product has no subscription pricing or plan catalog.',
    },
    {
      resource: 'subscription',
      reason:
        'Plaid Transfer product has no recurring-billing or subscription management layer.',
    },
  ],
} as const
