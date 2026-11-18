export const metadata = {
  platform: 'rebill',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'invoice',
    'plan',
    'refund',
    'subscription',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'UNVERIFIED: docs.rebill.com is a JS-rendered SPA returning no content to scraping tools; no /balance-transactions endpoint could be confirmed or ruled out.',
    },
    {
      resource: 'dispute',
      reason:
        'UNVERIFIED: Rebill has a Disputes dashboard UI (product changelog), but no REST API endpoint for disputes was found in any accessible source.',
    },
    {
      resource: 'payment-method',
      reason:
        'UNVERIFIED: no /payment-methods or /cards endpoint was found in any accessible documentation; docs.rebill.com is JS-rendered and returned no content.',
    },
    {
      resource: 'payout',
      reason:
        'UNVERIFIED: no /payouts endpoint was found in any accessible documentation; docs.rebill.com is JS-rendered and returned no content.',
    },
  ],
} as const
