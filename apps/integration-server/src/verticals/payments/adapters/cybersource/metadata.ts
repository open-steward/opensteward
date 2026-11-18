export const metadata = {
  platform: 'cybersource',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'dispute',
    'refund',
    'invoice',
    'payment-method',
    'subscription',
    'plan',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason: 'No per-transaction balance ledger endpoint; settlement data is only available via the Reporting API as bulk file downloads, not a REST record endpoint',
    },
    {
      resource: 'payout',
      reason: 'POST /pts/v2/payouts is an outbound credit-push (OCT/Visa Direct) to a recipient card with no GET list endpoint; it does not represent merchant settlement payouts',
    },
  ],
} as const
