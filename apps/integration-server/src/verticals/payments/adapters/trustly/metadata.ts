export const metadata = {
  platform: 'trustly',
  totalResources: 10,
  availableResources: ['charge', 'refund', 'balance-transaction'],
  unavailableResources: [
    {
      resource: 'customer',
      reason:
        'Trustly has no customer object; bank accounts are identified per-transaction via EndUserID only.',
    },
    {
      resource: 'payment-method',
      reason:
        'No stored payment-method API; bank details are captured ephemerally inside the Trustly checkout flow.',
    },
    {
      resource: 'subscription',
      reason:
        'Trustly is a push-payment gateway with no subscription or recurring billing API.',
    },
    {
      resource: 'invoice',
      reason: 'No invoice object or API exists in the Trustly classic API.',
    },
    {
      resource: 'plan',
      reason: 'No plan, price, or product catalog in the Trustly classic API.',
    },
    {
      resource: 'dispute',
      reason:
        'No dispute management API; chargebacks appear as AccountLedger rows only, with no structured dispute resource.',
    },
    {
      resource: 'payout',
      reason:
        'UNVERIFIED: GetWithdrawals method is documented to exist and returns payout status (EXECUTING/EXECUTED), but exact response field names could not be verified (docs return HTTP 403).',
    },
  ],
} as const
