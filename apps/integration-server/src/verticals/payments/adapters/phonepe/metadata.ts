export const metadata = {
  platform: 'phonepe',
  totalResources: 10,
  availableResources: ['charge', 'refund', 'subscription'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'No balance/settlement transaction REST API on the Standard Checkout V2 surface; settlement data is available only via the merchant dashboard',
    },
    {
      resource: 'customer',
      reason: 'PhonePe has no customer management API; payers are identified by UPI VPA only',
    },
    {
      resource: 'dispute',
      reason: 'No dispute or chargeback REST API documented on the PhonePe developer portal',
    },
    {
      resource: 'invoice',
      reason: 'No invoice API; PhonePe is a transaction gateway without an invoicing surface',
    },
    {
      resource: 'payment-method',
      reason:
        'No standalone payment method management API; instruments are captured per-transaction via UPI intent',
    },
    {
      resource: 'payout',
      reason:
        'Settlements are processed automatically on a T+1 cycle and are only visible via the merchant dashboard; no payout disbursement REST API exists',
    },
    {
      resource: 'plan',
      reason:
        'No plan/product catalog API; Autopay subscriptions use inline amount/frequency fields, not reusable plan objects',
    },
  ],
} as const
