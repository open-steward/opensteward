export const metadata = {
  platform: 'computop',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'payment-method',
    'refund',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason: 'Computop exposes settlement data only as CSV files via SFTP download — no REST endpoint exists.',
    },
    {
      resource: 'dispute',
      reason: 'Computop Paygate REST API v2 has no chargeback or dispute management endpoint.',
    },
    {
      resource: 'invoice',
      reason: 'Computop Paygate REST API v2 has no invoice endpoint.',
    },
    {
      resource: 'payout',
      reason: 'Computop exposes settlement/payout data only as CSV files via SFTP — no REST payout endpoint exists.',
    },
    {
      resource: 'plan',
      reason: 'UNVERIFIED: Computop REST API v2 lists /payment-plans endpoints but the response schema field names are inaccessible (Redocly sub-pages return 404, developer.computop.com requires login); writing a transform without confirmed field names would require fabrication.',
    },
    {
      resource: 'subscription',
      reason: 'UNVERIFIED: Computop recurring billing is handled via /payment-plans endpoints whose response schema is inaccessible (Redocly sub-pages return 404, developer.computop.com requires login); writing a transform without confirmed field names would require fabrication.',
    },
  ],
} as const
