export const metadata = {
  platform: 'mural-pay',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'refund',
    'payout',
    'balance-transaction',
  ],
  unavailableResources: [
    {
      resource: 'dispute',
      reason: 'Mural Pay is a stablecoin-native B2B platform; no traditional payment dispute/chargeback concept exists',
    },
    {
      resource: 'invoice',
      reason: 'Mural Pay has no invoicing system; the API offers no invoice endpoints',
    },
    {
      resource: 'payment-method',
      reason: 'Mural Pay has no stored customer payment methods (cards/bank debits for charging); counterparty payout methods are for sending, not charging',
    },
    {
      resource: 'plan',
      reason: 'Mural Pay has no subscription billing; no plans or recurring pricing concepts in the API',
    },
    {
      resource: 'subscription',
      reason: 'Mural Pay has no subscription billing; the API offers no subscription endpoints',
    },
  ],
} as const
