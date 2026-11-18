export const metadata = {
  platform: 'affirm',
  totalResources: 10,
  availableResources: ['charge', 'refund'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason: 'UNVERIFIED: Affirm has a settlement events endpoint (GET /api/v1/settlements/events) but response field names are behind an authenticated API reference that returned 429/403 during research.',
    },
    {
      resource: 'customer',
      reason: 'Affirm is a BNPL platform; merchants do not create or manage customer records — consumer identity is handled internally by Affirm during checkout.',
    },
    {
      resource: 'dispute',
      reason: 'UNVERIFIED: Affirm has a Partner Disputes API (GET /api/partner/v1/merchants/{merchant_id}/disputes) but response field names are behind an authenticated reference that returned 429 during research.',
    },
    {
      resource: 'invoice',
      reason: 'Affirm has no invoicing concept; it is a single-transaction BNPL gateway with no billing cycle or invoice object.',
    },
    {
      resource: 'payment-method',
      reason: 'Affirm is itself the payment method (installment loan); merchants cannot create, list, or attach payment methods via the API.',
    },
    {
      resource: 'payout',
      reason: 'Affirm disburses funds to merchants via ACH through its lending partners; there is no merchant-facing Payout API endpoint.',
    },
    {
      resource: 'plan',
      reason: 'Affirm does not support recurring billing or subscription plans; it processes one-time BNPL transactions only.',
    },
    {
      resource: 'subscription',
      reason: 'Affirm explicitly does not support recurring payments; the platform is one-time BNPL only.',
    },
  ],
} as const
