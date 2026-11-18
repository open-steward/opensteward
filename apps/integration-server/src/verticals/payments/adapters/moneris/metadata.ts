export const metadata = {
  platform: 'moneris',
  totalResources: 10,
  availableResources: ['charge', 'customer', 'refund', 'subscription'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason: 'Moneris provides no balance/ledger API endpoint; settlement data is only accessible via the Merchant Direct reporting portal',
    },
    {
      resource: 'invoice',
      reason: 'Moneris has no invoice concept in its payment API',
    },
    {
      resource: 'payout',
      reason: 'Moneris has no payout/disbursement endpoint in its REST API',
    },
    {
      resource: 'plan',
      reason: 'Moneris has no separate plan/pricing catalog; subscriptions are created directly with inline amounts/schedules',
    },
    {
      resource: 'dispute',
      reason: 'UNVERIFIED: Moneris has a separate Dispute Response API but the full spec requires authenticated developer portal access; main API dispute retrieval endpoints could not be confirmed from public docs',
    },
    {
      resource: 'payment-method',
      reason: 'UNVERIFIED: paymentMethodId concept is confirmed in Moneris API responses but GET/list endpoints for stored payment methods require authenticated developer portal access to verify',
    },
  ],
} as const
