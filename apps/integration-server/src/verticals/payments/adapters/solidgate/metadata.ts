export const metadata = {
  platform: 'solidgate',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'refund',
    'subscription',
    'dispute',
    'plan',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'Financial entries API returns a pre-signed S3 report URL, not individually addressable records; no listable balance-transaction endpoint exists',
    },
    {
      resource: 'invoice',
      reason:
        'Invoices are only accessible as nested objects inside subscription responses (listing invoices by subscription ID); no standalone invoice listing or retrieval endpoint exists',
    },
    {
      resource: 'payment-method',
      reason:
        'No dedicated payment instrument CRUD endpoints; card tokens are embedded in charge and recurring-payment flows and cannot be listed independently',
    },
    {
      resource: 'payout',
      reason:
        'Settlement payouts are managed via the Solidgate Hub dashboard only; no REST payout listing or retrieval endpoint is available in the public API',
    },
  ],
} as const
