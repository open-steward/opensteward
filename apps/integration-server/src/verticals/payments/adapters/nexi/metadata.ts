export const metadata = {
  platform: 'nexi',
  totalResources: 10,
  availableResources: [
    'charge',
    'refund',
    'subscription',
    'payout',
  ],
  unavailableResources: [
    {
      resource: 'customer',
      reason: 'No dedicated customer endpoint in the Nexi Checkout Payment API v1',
    },
    {
      resource: 'dispute',
      reason: 'No dispute management endpoint in the Nexi Checkout Payment API v1',
    },
    {
      resource: 'invoice',
      reason: 'No invoice endpoint in the Nexi Checkout Payment API v1',
    },
    {
      resource: 'payment-method',
      reason: 'GET /v1/paymentmethods returns merchant payment-method configuration (name/enabled flags), not customer-attached payment instruments',
    },
    {
      resource: 'plan',
      reason: 'No plan or product catalog endpoint in the Nexi Checkout Payment API v1',
    },
    {
      resource: 'balance-transaction',
      reason: 'GET /report/v1/balances returns aggregate credit/debit balance summaries per currency, not individual transaction records with ids',
    },
  ],
} as const
