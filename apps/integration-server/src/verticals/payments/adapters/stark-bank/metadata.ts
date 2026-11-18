export const metadata = {
  platform: 'stark-bank',
  totalResources: 10,
  availableResources: [
    'balance-transaction',
    'charge',
    'customer',
    'invoice',
    'payout',
    'refund',
    'subscription',
  ],
  unavailableResources: [
    {
      resource: 'dispute',
      reason: 'Stark Bank has no dispute/chargeback API; PixChargeback belongs to the separate Stark Infra product and is not part of the starkbank.com API.',
    },
    {
      resource: 'payment-method',
      reason: 'Stark Bank has no customer payment-method vault; there is no API for storing or listing customer cards or bank accounts.',
    },
    {
      resource: 'plan',
      reason: 'Stark Bank has no Plan/Price/Product catalog; subscription billing uses amount-per-InvoicePullSubscription with no separate plan entity.',
    },
  ],
} as const
