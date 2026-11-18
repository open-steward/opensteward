export const metadata = {
  platform: 'tamara',
  totalResources: 10,
  availableResources: ['charge', 'refund'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason: 'Tamara has no balance-transaction or ledger API; settlement reports are portal-only.',
    },
    {
      resource: 'customer',
      reason: 'Tamara has no customer management API; consumer data is embedded in order objects only.',
    },
    {
      resource: 'dispute',
      reason:
        'UNVERIFIED: The llms.txt index lists "Get Dispute Case details" and "Updating disputes by ID" endpoints, but docs.tamara.co/reference/getdisputecase returned 404 and no authoritative response schema (field names, endpoint path) could be confirmed.',
    },
    {
      resource: 'invoice',
      reason: 'Tamara has no invoice API; settlement statements are available only through the Partners Portal.',
    },
    {
      resource: 'payment-method',
      reason: 'Tamara has no payment-method API; payment type is embedded in the order object.',
    },
    {
      resource: 'payout',
      reason: 'Tamara has no payout API; settlements are processed automatically and visible only in the Partners Portal dashboard.',
    },
    {
      resource: 'plan',
      reason: 'Tamara is a BNPL gateway and has no subscription plan or pricing plan API.',
    },
    {
      resource: 'subscription',
      reason: 'Tamara is a BNPL gateway and has no subscription API.',
    },
  ],
} as const
