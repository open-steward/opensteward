export const metadata = {
  platform: 'bolt',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'refund',
    'subscription',
    'plan',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'Bolt exposes only a CSV statement export (POST /v1/merchant/statement) with no per-record JSON API for ledger entries.',
    },
    {
      resource: 'dispute',
      reason:
        'Disputes are managed via the Bolt dashboard and webhook notifications; no merchant REST API exists for retrieving dispute records.',
    },
    {
      resource: 'invoice',
      reason:
        'Bolt is a checkout-based processor with no invoice concept in its merchant REST API.',
    },
    {
      resource: 'payment-method',
      reason:
        'Saved payment methods are accessible only through a per-shopper OAuth token (Account API), not the static merchant API key this adapter uses.',
    },
    {
      resource: 'payout',
      reason:
        'Settlement data is available only as a CSV export (POST /v1/merchant/statement type=daily_funding); no per-record payout REST API.',
    },
  ],
} as const
