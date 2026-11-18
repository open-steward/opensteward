export const metadata = {
  platform: 'ebanx',
  totalResources: 10,
  availableResources: ['charge', 'refund', 'payout'],
  unavailableResources: [
    {
      resource: 'customer',
      reason: 'No first-class customer object; payer info is embedded inline on each payment',
    },
    {
      resource: 'payment-method',
      reason: 'No stored/reusable payment method store; card tokens are single-use only',
    },
    {
      resource: 'balance-transaction',
      reason: 'No ledger/transaction-history API; /ws/payout/balance returns current balance only, not a transaction list',
    },
    {
      resource: 'dispute',
      reason: 'Chargebacks handled via SFTP file upload, no REST dispute list/get endpoint',
    },
    {
      resource: 'invoice',
      reason: 'No invoice concept in EBANX Direct API',
    },
    {
      resource: 'plan',
      reason: 'No subscription plan management API',
    },
    {
      resource: 'subscription',
      reason: 'Recurring Pix (Pix Automático) uses enrollment webhooks, not a REST list/get API',
    },
  ],
} as const
