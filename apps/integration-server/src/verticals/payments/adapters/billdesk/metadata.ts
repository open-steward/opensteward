export const metadata = {
  platform: 'billdesk',
  totalResources: 10,
  availableResources: [
    'charge',
    'refund',
    'subscription',
    'invoice',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason: 'BillDesk has no per-transaction ledger API; the settlements endpoint (/pasettlements/v1_2/settlements/get) returns batch settlement summaries only, not individual balance transaction records',
    },
    {
      resource: 'customer',
      reason: 'BillDesk has no standalone customer management API; customer identity is embedded in mandate and order metadata only',
    },
    {
      resource: 'dispute',
      reason: 'BillDesk has no dispute API; chargebacks and disputes are handled through the merchant dashboard and banking network, not exposed via REST',
    },
    {
      resource: 'payment-method',
      reason: 'UNVERIFIED: card-account endpoints exist (/pgsi/ve1_2/cardaccounts/*) and are confirmed in BillDesk docs index, but response field names (last4, brand, expiry, etc.) are not accessible without merchant login credentials',
    },
    {
      resource: 'payout',
      reason: 'BillDesk has no per-payout object API; the settlements endpoint (/pasettlements/v1_2/settlements/get) uses a different base path and returns settlement batch summaries, not individual payout records',
    },
    {
      resource: 'plan',
      reason: 'BillDesk has no plan/product/price catalog API; mandate amounts and frequencies are set at mandate-creation time with no reusable plan objects',
    },
  ],
} as const
