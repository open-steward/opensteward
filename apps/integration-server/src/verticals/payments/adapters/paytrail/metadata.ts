export const metadata = {
  platform: 'paytrail',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'payout',
    'refund',
  ],
  unavailableResources: [
    { resource: 'balance-transaction', reason: 'No balance/ledger endpoint; GET /settlements returns settlement IDs only with no per-transaction fee or net breakdown' },
    { resource: 'dispute', reason: 'No dispute management endpoint in the Paytrail API' },
    { resource: 'invoice', reason: 'POST /payments/{id}/activate-invoice is an action only; no GET /invoices listing endpoint exists' },
    { resource: 'payment-method', reason: 'Tokenization endpoint creates one-off tokens but there is no listing endpoint for saved card tokens' },
    { resource: 'plan', reason: 'No subscription plan or pricing catalog endpoint in the Paytrail API' },
    { resource: 'subscription', reason: 'Recurring billing uses tokenized MIT charges; no subscription resource endpoint exists' },
  ],
} as const
